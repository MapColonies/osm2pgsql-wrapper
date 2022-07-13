import { join } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { BoundingBox } from '@map-colonies/tile-calc';
import { IConfig, RemoteResource } from '../../../common/interfaces';
import { DATA_DIR, SERVICES, DIFF_FILE_EXTENTION, EXPIRE_LIST } from '../../../common/constants';
import { streamToUniqueLines, getDiffDirPathComponents, streamToFs, valuesToRange } from '../../../common/util';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { AppendEntity } from '../../../validation/schemas';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { QueueProvider } from '../../../queue/queueProvider';
import { RequestAlreadyInQueueError } from '../../../common/errors';
import { RemoteResourceManager } from '../../../remoteResource/remoteResourceManager';
import { QueueSettings, TileRequestQueuePayload } from './interfaces';
import { StateTracker } from './stateTracker';
import { ExpireTilesParser } from './expireTilesParser';
import { ExpireTilePostFilterFunc } from './expireTilesFilters';

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
    private readonly remoteResourceManager: RemoteResourceManager,
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

    const resources: RemoteResource[] = [];
    this.entities.forEach((entity) => {
      resources.push({ id: join(this.stateTracker.projectId, entity.script), type: 'script' });
      if (entity.geometryKey !== undefined) {
        resources.push({ id: entity.geometryKey, type: 'geometry' });
      }
    });

    await this.remoteResourceManager.load(resources);

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

  private async appendEntity(entity: AppendEntity, diffPath: string): Promise<void> {
    const appendArgs = [];

    const scriptId = join(this.stateTracker.projectId, entity.script);
    const localScriptPath = this.remoteResourceManager.getResource<string>(scriptId);
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
          await this.pushExpiredTilesToQueue(localExpireTilesListPath, entity.geometryKey);
        }
      }
    });

    await Promise.all(uploadPromises);
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

  private async pushExpiredTilesToQueue(expireListPath: string, geometryKey?: string): Promise<void> {
    const expireListStream = fs.createReadStream(expireListPath);
    const expireList = await streamToUniqueLines(expireListStream);

    if (expireList.length === 0) {
      this.logger.info({ msg: 'no expire tiles to push to queue', reason: 'generated expire list is empty' });
      return;
    }

    const expiredTilesBbox = this.buildFilteredExpiredTilesBbox(expireList, geometryKey);

    if (expiredTilesBbox.length === 0) {
      this.logger.info({
        msg: 'no expire tiles to push to queue',
        reason: 'all tiles were filtered',
      });
      return;
    }

    const payload: TileRequestQueuePayload = {
      bbox: expiredTilesBbox,
      source: 'expiredTiles',
      minZoom: (this.queueSettings as QueueSettings).minZoom,
      maxZoom: (this.queueSettings as QueueSettings).maxZoom,
    };

    await this.pushPayloadToQueue(payload);
  }

  private buildFilteredExpiredTilesBbox(expireList: string[], geometryId?: string): BoundingBox[] {
    const postFilters: ExpireTilePostFilterFunc[] = [];
    if (geometryId !== undefined) {
      const geometryFilter = this.remoteResourceManager.getResource<ExpireTilePostFilterFunc>(geometryId);
      postFilters.push(geometryFilter);
    }

    const expireListParser = new ExpireTilesParser({ filterMaxZoom: true, postFilters });

    const bbox = expireListParser.parseExpireListToFilteredBbox(expireList);

    this.logger.info({
      msg: 'filtered expired tiles',
      preFiltersCount: expireListParser.getPreFilters.length,
      postFiltersCount: expireListParser.getPostFilters.length,
      geometryId,
      preTilesCount: expireList.length,
      postTilesCount: bbox.length,
    });

    return bbox;
  }

  private async pushPayloadToQueue(payload: TileRequestQueuePayload): Promise<void> {
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
}
