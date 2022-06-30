import { join } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Feature, Geometry } from '@turf/turf';
import geojsonValidator from '@turf/boolean-valid';
import { IConfig } from '../../../common/interfaces';
import { DATA_DIR, SERVICES, DIFF_FILE_EXTENTION, EXPIRE_LIST } from '../../../common/constants';
import {
  streamToUniqueLines,
  createDirectory,
  getDiffDirPathComponents,
  getFileDirectory,
  streamToFs,
  streamToString,
  valuesToRange,
} from '../../../common/util';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { AppendEntity } from '../../../validation/schemas';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { QueueProvider } from '../../../queue/queueProvider';
import { InvalidGeojsonError, RequestAlreadyInQueueError } from '../../../common/errors';
import { QueueSettings, RemoteResource, TileRequestQueuePayload } from './interfaces';
import { StateTracker } from './stateTracker';
import { ExpireTilesParser } from './expireTilesParser';
import { filterByGeometry, filterByZoom } from './expireTilesFilters';

const geometries: Record<string, Geometry | Feature> = {};

export class AppendManager {
  private entities: AppendEntity[] = [];
  private uploadTargets: ExpireTilesUploadTarget[] = [];
  private readonly shouldGenerateExpireOutput: boolean;
  private readonly queueSettings?: QueueSettings;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    private readonly stateTracker: StateTracker,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient,
    private readonly osmCommandRunner: OsmCommandRunner,
    configStore: IConfig,
    private readonly queueProvider?: QueueProvider
  ) {
    this.shouldGenerateExpireOutput = config.get<boolean>('osm2pgsql.generateExpireOutput');
    if (configStore.has('queue')) {
      this.queueSettings = configStore.get<QueueSettings>('queue');
    }
  }

  public async prepareManager(projectId: string, entities: AppendEntity[], uploadTargets: ExpireTilesUploadTarget[], limit?: number): Promise<void> {
    await this.stateTracker.prepareEnvironment(projectId, limit);

    this.entities = entities;

    this.uploadTargets = [...new Set(uploadTargets)];

    if (this.queueProvider) {
      await this.queueProvider.startQueue();
    }
  }

  public async append(replicationUrl: string): Promise<void> {
    await this.stateTracker.getStartSequenceNumber();

    await this.stateTracker.getReplicationSequenceNumber(replicationUrl);

    if (this.stateTracker.isUpToDateOrReachedLimit()) {
      this.logger.info({
        msg: 'state is up to date. there is nothing to append',
        state: this.stateTracker.current,
        projectId: this.stateTracker.projectId,
      });
      return;
    }

    const resources: RemoteResource[] = [];
    this.entities.forEach((entity) => {
      resources.push({ key: join(this.stateTracker.projectId, entity.script), type: 'script' });
      if (entity.geometryKey !== undefined) {
        resources.push({ key: entity.geometryKey, type: 'geojson' });
      }
    });

    await this.getRemoteResources([...new Set(resources)]);

    while (!this.stateTracker.isUpToDateOrReachedLimit()) {
      await this.appendNextState(replicationUrl);

      if (this.shouldGenerateExpireOutput) {
        await this.uploadExpired();
      }

      await this.stateTracker.updateRemoteState();

      this.stateTracker.updateRemainingAppends();
    }

    const { projectId, start, current } = this.stateTracker;
    this.logger.info({ msg: 'successfully appended project', projectId, startState: start, currentState: current });
  }

  private async appendNextState(replicationUrl: string): Promise<void> {
    this.logger.info({
      msg: 'attempting to append state on entities',
      state: this.stateTracker.nextState,
      projectId: this.stateTracker.projectId,
      entitiesCount: this.entities.length,
    });

    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const appendPromises = this.entities.map(async (entity) => {
      await this.appendEntity(entity, simplifiedDiffPath);
    });

    await Promise.all(appendPromises);
  }

  private async uploadExpired(): Promise<void> {
    this.logger.info({ msg: 'uploading expired-tiles to upload targets', targetsCount: this.uploadTargets.length, targets: this.uploadTargets });

    const uploadPromises = this.entities.map(async (entity) => {
      const expireTilesFileName = `${entity.id}.${this.stateTracker.nextState}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.stateTracker.projectId, expireTilesFileName);

      for await (const target of this.uploadTargets) {
        if (target === 's3') {
          await this.uploadExpiredListToS3(localExpireTilesListPath, entity.id);
        }
        if (target === 'queue') {
          await this.pushExpireTilesToQueue(localExpireTilesListPath, entity.geometryKey);
        }
      }
    });

    await Promise.all(uploadPromises);
  }

  private async appendEntity(entity: AppendEntity, diffPath: string): Promise<void> {
    const appendArgs = [];

    const localScriptPath = join(DATA_DIR, this.stateTracker.projectId, entity.script);
    appendArgs.push(`--style=${localScriptPath}`);

    let expireTilesZoom = 'default';
    if (entity.zoomLevel) {
      expireTilesZoom = valuesToRange(entity.zoomLevel.min, entity.zoomLevel.max);
      appendArgs.push(`--expire-tiles=${expireTilesZoom}`);
    }

    if (this.shouldGenerateExpireOutput) {
      const expireTilesFileName = `${entity.id}.${this.stateTracker.nextState}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.stateTracker.projectId, expireTilesFileName);
      appendArgs.push(`--expire-output=${localExpireTilesListPath}`);
    }

    this.logger.info({ msg: 'attempting to osm2pg append', entityId: entity.id, expireTilesZoom, projectId: this.stateTracker.projectId });

    await this.osmCommandRunner.append([...appendArgs, diffPath]);
  }

  private async uploadExpiredListToS3(expireListPath: string, entityId: string): Promise<void> {
    this.logger.info({
      msg: 'uploading expired-tiles to s3',
      state: this.stateTracker.nextState,
      entityId,
      projectId: this.stateTracker.projectId,
      bucketName: this.s3Client.bucketName,
      acl: this.s3Client.acl,
    });

    const expireTilesListBuffer = await fsPromises.readFile(expireListPath);
    const expireListKey = join(this.stateTracker.projectId, entityId, this.stateTracker.nextState.toString(), EXPIRE_LIST);

    await this.s3Client.putObjectWrapper(expireListKey, expireTilesListBuffer);
  }

  private async pushExpireTilesToQueue(expireListPath: string, geometryKey?: string): Promise<void> {
    this.logger.info({
      msg: 'pushing expired-tiles to queue',
      queueName: this.queueProvider?.activeQueueName,
      state: this.stateTracker.nextState,
      projectId: this.stateTracker.projectId,
    });

    const expireListStream = fs.createReadStream(expireListPath);

    const expireList = await streamToUniqueLines(expireListStream);
    if (expireList.length === 0) {
      return;
    }

    const expireListParser = new ExpireTilesParser(expireList);
    const preFilters = [filterByZoom(expireListParser.maxZoom)];
    const postFilters = geometryKey !== undefined ? [filterByGeometry(geometries[geometryKey])] : [];
    const bbox = expireListParser.expireListToBboxArray(preFilters, postFilters);

    const payload: TileRequestQueuePayload = {
      bbox,
      source: 'expiredTiles',
      minZoom: (this.queueSettings as QueueSettings).minZoom,
      maxZoom: (this.queueSettings as QueueSettings).maxZoom,
    };

    this.logger.debug({
      msg: 'pushing the following expired-tiles payload to queue',
      queueName: this.queueProvider?.activeQueueName,
      payload,
      state: this.stateTracker.nextState,
      projectId: this.stateTracker.projectId,
    });

    try {
      await (this.queueProvider as QueueProvider).push(payload);
    } catch (error) {
      if (error instanceof RequestAlreadyInQueueError) {
        this.logger.warn({ err: error, state: this.stateTracker.nextState });
      }
    }
  }

  private async getDiffToFs(replicationUrl: string): Promise<string> {
    const [top, bottom, sequenceNumber] = getDiffDirPathComponents(this.stateTracker.nextState);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const localDiffPath = join(DATA_DIR, `${this.stateTracker.nextState}.${DIFF_FILE_EXTENTION}`);

    this.logger.info({
      msg: 'getting osm change file from remote replication source to file system',
      replicationUrl,
      state: this.stateTracker.nextState,
      projectId: this.stateTracker.projectId,
    });

    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    await streamToFs(response.data, localDiffPath);

    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    this.logger.info({
      msg: 'simplifying osm change file by removing all duplicates',
      diffPath,
      state: this.stateTracker.nextState,
      projectId: this.stateTracker.projectId,
    });

    const simplifiedDiffPath = join(DATA_DIR, `${this.stateTracker.nextState}.simplified.${DIFF_FILE_EXTENTION}`);
    await this.osmCommandRunner.mergeChanges([`${diffPath}`, `--output=${simplifiedDiffPath}`]);
    return simplifiedDiffPath;
  }

  private async getRemoteResources(resouces: RemoteResource[]): Promise<void> {
    this.logger.info({
      msg: 'getting remote resources from bucket',
      projectId: this.stateTracker.projectId,
      count: resouces.length,
      bucketName: this.s3Client.bucketName,
    });

    const getResourcePromises = resouces.map(async (resource) => {
      const stream = await this.s3Client.getObjectWrapper(resource.key);
      const content = await streamToString(stream);

      if (resource.type === 'script') {
        const localScriptPath = join(DATA_DIR, resource.key);
        await createDirectory(getFileDirectory(localScriptPath));
        await fsPromises.writeFile(localScriptPath, content);
        return;
      }

      const geojson = JSON.parse(content) as Feature | Geometry;
      const isValid = geojsonValidator(geojson);
      if (!isValid) {
        throw new InvalidGeojsonError(`geojson with key ${resource.key} is invalid`);
      }

      geometries[resource.key] = geojson;
    });

    await Promise.all(getResourcePromises);
  }
}
