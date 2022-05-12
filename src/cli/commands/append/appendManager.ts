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
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { QueueProvider } from '../../../queue/queueProvider';
import { RequestAlreadyInQueueError } from '../../../common/errors';
import { QueueSettings, TileRequestQueuePayload } from './interfaces';
import { StateTracker } from './stateTracker';
import { expireListStreamToBboxArray } from './util';

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
      this.logger.info(`state is up to date, there is nothing to append`);
      return;
    }

    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(this.stateTracker.projectId, entity.script)));
    await this.stateTracker.getScriptsFromS3ToFs(scriptsKeys);

    while (!this.stateTracker.isUpToDateOrReachedLimit()) {
      await this.appendNextState(replicationUrl);

      if (this.shouldGenerateExpireOutput) {
        await this.uploadExpired();
      }

      await this.stateTracker.updateRemoteState();

      this.stateTracker.updateRemainingAppends();
    }

    const { projectId, start, current } = this.stateTracker;
    this.logger.info(`successfully appended ${projectId} from ${start} to ${current} overall`);
  }

  private async appendNextState(replicationUrl: string): Promise<void> {
    this.logger.info(`${this.stateTracker.projectId} appending sequence number ${this.stateTracker.nextState()}`);

    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const appendPromises = this.entities.map(async (entity) => {
      await this.appendEntity(entity, simplifiedDiffPath);
    });

    await Promise.all(appendPromises);

    this.logger.info(`all appends completed successfuly for state ${this.stateTracker.nextState()}`);
  }

  private async uploadExpired(): Promise<void> {
    const uploadPromises = this.entities.map(async (entity) => {
      const expireTilesFileName = `${entity.id}.${this.stateTracker.nextState()}.${EXPIRE_LIST}`;
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
      const expireTilesFileName = `${entity.id}.${this.stateTracker.nextState()}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.stateTracker.projectId, expireTilesFileName);
      appendArgs.push(`--expire-output=${localExpireTilesListPath}`);
    }

    this.logger.info(`initializing the append of ${entity.id} on ${expireTilesZoom} zoom levels`);

    await this.osmCommandRunner.append([...appendArgs, diffPath]);

    this.logger.info(`appending completed for ${entity.id}`);
  }

  private async uploadExpiredListToS3(expireListPath: string, entityId: string): Promise<void> {
    const expireTilesListBuffer = await fsPromises.readFile(expireListPath);
    const expireListKey = join(this.stateTracker.projectId, entityId, this.stateTracker.nextState().toString(), EXPIRE_LIST);

    await this.s3Client.putObjectWrapper(expireListKey, expireTilesListBuffer);
  }

  private async pushExpireTilesToQueue(expireListPath: string): Promise<void> {
    const expireListStream = fs.createReadStream(expireListPath);

    const bbox = await expireListStreamToBboxArray(expireListStream);

    const payload: TileRequestQueuePayload = {
      bbox,
      source: 'expiredTiles',
      minZoom: (this.queueSettings as QueueSettings).minZoom,
      maxZoom: (this.queueSettings as QueueSettings).maxZoom,
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

    const [top, bottom, sequenceNumber] = getDiffDirPathComponents(this.stateTracker.nextState());
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const localDiffPath = join(DATA_DIR, `${this.stateTracker.nextState()}.${DIFF_FILE_EXTENTION}`);

    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    await streamToFs(response.data, localDiffPath);

    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    this.logger.info(`simplifying osm change file by removing all duplicates`);

    const simplifiedDiffPath = join(DATA_DIR, `${this.stateTracker.nextState()}.simplified.${DIFF_FILE_EXTENTION}`);
    await this.osmCommandRunner.mergeChanges([`${diffPath}`, `--output=${simplifiedDiffPath}`]);
    return simplifiedDiffPath;
  }
}
