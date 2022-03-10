import { join } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from '../../../common/interfaces';
import { DATA_DIR, SERVICES, DIFF_FILE_EXTENTION, EXPIRE_LIST } from '../../../common/constants';
import { getDiffDirPathComponents, removeDuplicates, streamToFs, valuesToRange } from '../../../common/util';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { AppendEntity } from '../../../validation/schemas';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { OsmCommandRunner } from '../../../commandRunner/OsmCommandRunner';
import { QueueProvider } from '../../../queue/queueProvider';
import { RequestAlreadyInQueueError } from '../../../common/errors';
import { QueueSettings, TileRequestQueuePayload } from './interfaces';
import { StateTracker } from './stateTracker';
import { expireListStreamToBboxArray } from './util';

export class AppendManager {
  private entities: AppendEntity[] = [];
  private uploadTargets: ExpireTilesUploadTarget[] = [];
  private readonly shouldGenerateExpireOutput: boolean;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    private readonly stateTracker: StateTracker,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient,
    private readonly osmCommandRunner: OsmCommandRunner,
    private readonly configStore: IConfig,
    private readonly queueProvider?: QueueProvider
  ) {
    this.shouldGenerateExpireOutput = config.get<boolean>('osm2pgsql.generateExpireOutput');
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

    await this.stateTracker.getEndSequenceNumber(replicationUrl);

    if (this.stateTracker.isUpToDateOrReachedLimit()) {
      this.logger.info(`state is up to date, there is nothing to append`);
      return;
    }

    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(this.stateTracker.projectId, entity.script)));
    await this.stateTracker.getScriptsFromS3ToFs(scriptsKeys);

    while (!this.stateTracker.isUpToDateOrReachedLimit()) {
      await this.appendCurrentState(replicationUrl);

      if (this.shouldGenerateExpireOutput) {
        await this.uploadExpired();
      }

      await this.stateTracker.updateRemoteState();

      this.stateTracker.updateRemainingAppends();
    }

    const { projectId, start, current } = this.stateTracker;
    this.logger.info(`successfully appended ${projectId} from ${start} to ${current - 1} overall`);
  }

  private async appendCurrentState(replicationUrl: string): Promise<void> {
    this.logger.info(`${this.stateTracker.projectId} current sequence number ${this.stateTracker.current}`);

    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const appendPromises = this.entities.map(async (entity) => {
      await this.appendEntity(entity, simplifiedDiffPath);
    });

    await Promise.all(appendPromises);

    this.logger.info(`all appends completed successfuly for state ${this.stateTracker.current}`);
  }

  private async uploadExpired(): Promise<void> {
    const uploadPromises = this.entities.map(async (entity) => {
      const expireTilesFileName = `${entity.id}.${this.stateTracker.current}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.stateTracker.projectId, expireTilesFileName);

      for await (const target of this.uploadTargets) {
        if (target === 's3') {
          await this.uploadExpiredListToS3(localExpireTilesListPath, entity.id);
        }
        if (target === 'queue') {
          await this.pushExpireTilesToQueue(localExpireTilesListPath);
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
      const expireTilesFileName = `${entity.id}.${this.stateTracker.current}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.stateTracker.projectId, expireTilesFileName);
      appendArgs.push(`--expire-output=${localExpireTilesListPath}`);
    }

    this.logger.info(`initializing the append of ${entity.id} on ${expireTilesZoom} zoom levels`);

    await this.osmCommandRunner.append([...appendArgs, diffPath]);

    this.logger.info(`appending completed for ${entity.id}`);
  }

  private async uploadExpiredListToS3(expireListPath: string, entityId: string): Promise<void> {
    const expireTilesListBuffer = await fsPromises.readFile(expireListPath);
    const expireListKey = join(this.stateTracker.projectId, entityId, this.stateTracker.current.toString(), EXPIRE_LIST);

    await this.s3Client.putObjectWrapper(expireListKey, expireTilesListBuffer);
  }

  private async pushExpireTilesToQueue(expireListPath: string): Promise<void> {
    const expireListStream = fs.createReadStream(expireListPath);

    const bbox = await expireListStreamToBboxArray(expireListStream);

    const queueSettings = this.configStore.get<QueueSettings>('queue');

    const payload: TileRequestQueuePayload = {
      bbox,
      source: 'expiredTiles',
      minZoom: queueSettings.minZoom,
      maxZoom: queueSettings.maxZoom,
    };

    try {
      await (this.queueProvider as QueueProvider).push(payload);
    } catch (error) {
      if (error instanceof RequestAlreadyInQueueError) {
        this.logger.warn(`${error.message}`);
      }
    }
  }

  private async getDiffToFs(replicationUrl: string): Promise<string> {
    this.logger.info(`getting osm change file from remote replication source to file system`);

    const [top, bottom, sequenceNumber] = getDiffDirPathComponents(this.stateTracker.current);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const localDiffPath = join(DATA_DIR, `${this.stateTracker.current}.${DIFF_FILE_EXTENTION}`);

    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    await streamToFs(response.data, localDiffPath);

    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    this.logger.info(`simplifying osm change file by removing all duplicates`);

    const simplifiedDiffPath = join(DATA_DIR, `${this.stateTracker.current}.simplified.${DIFF_FILE_EXTENTION}`);
    await this.osmCommandRunner.mergeChanges([`${diffPath}`, `--output=${simplifiedDiffPath}`]);
    return simplifiedDiffPath;
  }
}
