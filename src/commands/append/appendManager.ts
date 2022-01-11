import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from '../../common/interfaces';
import {
  DATA_DIR,
  SERVICES,
  DEFAULT_SEQUENCE_NUMBER,
  SEQUENCE_NUMBER_REGEX,
  DIFF_TOP_DIR_DIVIDER,
  DIFF_BOTTOM_DIR_DIVIDER,
  DIFF_STATE_FILE_MODULO,
  DIFF_FILE_EXTENTION,
  STATE_FILE,
  EXPIRE_LIST,
  SEQUENCE_NUMBER_PADDING_AMOUNT,
} from '../../common/constants';
import { createDirectory, getFileDirectory, removeDuplicates, streamToFs, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { AppendEntity } from '../../validation/schema';
import { S3ClientWrapper } from '../../s3Client/s3Client';
import { CommandRunner } from '../../common/commandRunner';
import { InvalidStateFileError, OsmiumError, Osm2pgsqlError } from '../../common/errors';

let stateContent: string;

@injectable()
export class AppendManager {
  public start = DEFAULT_SEQUENCE_NUMBER;
  public end = DEFAULT_SEQUENCE_NUMBER;
  public current = DEFAULT_SEQUENCE_NUMBER;
  private projectId = '';
  private entities: AppendEntity[] = [];
  private readonly shouldGenerateExpireOutput: boolean;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient,
    private readonly commandRunner: CommandRunner
  ) {
    this.shouldGenerateExpireOutput = config.get<boolean>('osm2pgsql.generateExpireOutput');
  }

  public async prepareManager(projectId: string, entities: AppendEntity[]): Promise<void> {
    this.logger.info(`preparing environment, project id: ${projectId}, number of entities: ${entities.length}`);

    this.entities = entities;
    this.projectId = projectId;
    const dir = join(DATA_DIR, projectId);

    this.logger.debug(`creating directory ${dir}`);
    await createDirectory(dir);
  }

  public isUpToDate(): boolean {
    return this.current === this.end;
  }

  public async getStartSequenceNumber(bucket: string): Promise<void> {
    this.logger.info(`getting the start sequence number from bucket`);

    const stateKey = join(this.projectId, STATE_FILE);
    const stateStream = await this.s3Client.getObjectWrapper(bucket, stateKey);
    stateContent = await streamToString(stateStream);
    this.start = this.fetchSequenceNumber(stateContent);
    this.current = this.start + 1;

    this.logger.info(`start sequence number ${this.start}`);
  }

  public async getEndSequenceNumber(replicationUrl: string): Promise<void> {
    this.logger.info(`getting the end sequence number from remote replication source`);

    const response = await this.replicationClient.getState(replicationUrl);
    this.end = this.fetchSequenceNumber(response.data);

    this.logger.info(`end sequence number ${this.end}`);
  }

  public async getScriptsFromS3ToFs(bucket: string): Promise<void> {
    this.logger.info(`getting scripts from bucket to file system`);

    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(this.projectId, entity.script)));

    const getScriptPromises = scriptsKeys.map(async (scriptKey) => {
      const scriptStream = await this.s3Client.getObjectWrapper(bucket, scriptKey);
      const scriptFileContent = await streamToString(scriptStream);
      const localScriptPath = join(DATA_DIR, scriptKey);
      await createDirectory(getFileDirectory(localScriptPath));
      await fsPromises.writeFile(localScriptPath, scriptFileContent);
    });

    await Promise.all(getScriptPromises);
  }

  public async appendReplications(replicationUrl: string, bucket: string, acl: string): Promise<void> {
    this.logger.info(`${this.projectId} current sequence number ${this.current}`);

    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const appendPromises = this.entities.map(async (entity) => {
      await this.appendEntity(entity, simplifiedDiffPath, bucket, acl);
    });

    await Promise.all(appendPromises);

    this.logger.info(`all appends completed successfuly for state ${this.current}`);

    await this.updateRemoteState(bucket, acl);

    this.logger.info(`successfully updated the remote state source of ${this.projectId}, current state ${this.current}`);
  }

  private async appendEntity(entity: AppendEntity, diffPath: string, bucket: string, acl: string): Promise<void> {
    const appendArgs = [];

    const localScriptPath = join(DATA_DIR, this.projectId, entity.script);
    appendArgs.push(`--style=${localScriptPath}`);

    const expireTilesZoom = this.zoomLevelsToRange(entity.zoomLevel.min, entity.zoomLevel.max);
    appendArgs.push(`--expire-tiles=${expireTilesZoom}`);

    if (this.shouldGenerateExpireOutput) {
      const expireTilesFileName = `${entity.id}.${this.current}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.projectId, expireTilesFileName);
      appendArgs.push(`--expire-output=${localExpireTilesListPath}`);
    }

    this.logger.info(`initializing the append of ${entity.id} on zoom levels ${expireTilesZoom}`);

    const executable = 'osm2pgsql';
    const { exitCode } = await this.commandRunner.run(executable, '--append', [...appendArgs, diffPath]);

    if (exitCode !== 0) {
      this.logger.error(`${executable} exit with code ${exitCode as number}`);
      throw new Osm2pgsqlError(`an error occurred while running osm2pgsql, exit code ${exitCode as number}`);
    }

    this.logger.info(`appending completed for ${entity.id}`);

    if (this.shouldGenerateExpireOutput) {
      await this.uploadExpireList(entity.id, bucket, acl);
    }
  }

  private async uploadExpireList(entityId: string, bucket: string, acl: string): Promise<void> {
    this.logger.info(`uploading expire list of entity ${entityId}`);

    const expireTilesFileName = `${entityId}.${this.current}.${EXPIRE_LIST}`;
    const localExpireTilesListPath = join(DATA_DIR, this.projectId, expireTilesFileName);
    const expireTilesListContent = await fsPromises.readFile(localExpireTilesListPath);
    const expireListKey = join(this.projectId, entityId, this.current.toString(), EXPIRE_LIST);
    await this.s3Client.putObjectWrapper(bucket, expireListKey, expireTilesListContent, acl);
  }

  private async updateRemoteState(bucket: string, acl: string): Promise<void> {
    this.logger.info(`updating remote state from ${this.current} to ${this.current + 1}`);

    stateContent = stateContent.replace(SEQUENCE_NUMBER_REGEX, `sequenceNumber=${this.current}`);
    const stateBuffer = Buffer.from(stateContent, 'utf-8');
    const stateKey = join(this.projectId, STATE_FILE);
    await this.s3Client.putObjectWrapper(bucket, stateKey, stateBuffer, acl);
    this.current++;
  }

  private async getDiffToFs(replicationUrl: string): Promise<string> {
    this.logger.info(`getting osm change file from remote replication source to file system`);

    const [top, bottom, sequenceNumber] = this.getDiffDirPathComponents(this.current);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const localDiffPath = join(DATA_DIR, `${this.current}.${DIFF_FILE_EXTENTION}`);
    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    await streamToFs(response.data, localDiffPath);
    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    this.logger.info(`simplifying osm change file by removing all duplicates`);

    const simplifiedDiffPath = join(DATA_DIR, `${this.current}.simplified.${DIFF_FILE_EXTENTION}`);
    const executable = 'osmium';
    const { exitCode } = await this.commandRunner.run(executable, 'merge-changes', ['--simplify', `${diffPath}`, `--output=${simplifiedDiffPath}`]);
    if (exitCode !== 0) {
      this.logger.error(`${executable} exit with code ${exitCode as number}`);
      throw new OsmiumError(`an error occurred while running ${executable}, exit code ${exitCode as number}`);
    }
    return simplifiedDiffPath;
  }

  private fetchSequenceNumber(content: string): number {
    const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
    if (matchResult === null || matchResult.length === 0) {
      this.logger.error('failed to fetch sequence number out of the state file');
      throw new InvalidStateFileError('could not fetch sequence number out of the state file');
    }
    return parseInt(matchResult[0].split('=')[1]);
  }

  private readonly getDiffDirPathComponents = (sequenceNumber: number): string[] => {
    const top = sequenceNumber / DIFF_TOP_DIR_DIVIDER;
    const bottom = (sequenceNumber % DIFF_TOP_DIR_DIVIDER) / DIFF_BOTTOM_DIR_DIVIDER;
    const state = sequenceNumber % DIFF_STATE_FILE_MODULO;
    return [top, bottom, state].map((component: number) => {
      const floored = Math.floor(component);
      return floored.toString().padStart(SEQUENCE_NUMBER_PADDING_AMOUNT, '0');
    });
  };

  private zoomLevelsToRange(min: number, max: number | undefined): string {
    if (max === undefined) {
      return min.toString();
    }
    return `${min}-${max}`;
  }
}
