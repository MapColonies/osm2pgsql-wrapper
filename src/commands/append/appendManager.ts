import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
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
  SEQUENCE_NUMBER_PAD_AMOUNT,
} from '../../common/constants';
import { createDirectory, getFileDirectory, removeDuplicates, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { AppendEntity } from '../../validation/schema';
import { S3ClientWrapper } from '../../s3Client/s3Client';
import { CommandRunner } from '../../common/commandRunner';
import { InvalidStateFileError } from '../../common/errors';

let stateContent: string;

@injectable()
export class AppendManager {
  private start = DEFAULT_SEQUENCE_NUMBER;
  private end = DEFAULT_SEQUENCE_NUMBER;
  private current = DEFAULT_SEQUENCE_NUMBER;
  private appendId = '';
  private entities: AppendEntity[] = [];

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient,
    private readonly commandRunner: CommandRunner
  ) { }

  public async prepareManager(id: string, entities: AppendEntity[]): Promise<void> {
    this.logger.info(`preparing environment, id: ${id}, number of entities: ${entities.length}`);
    this.appendId = id;
    const dir = join(DATA_DIR, id);
    await createDirectory(dir);
    this.entities = entities;
  }

  public isUpToDate(): boolean {
    return this.current === this.end;
  }

  public async getStartSequenceNumber(bucket: string): Promise<void> {
    this.logger.info(`getting the start sequence number from bucket`);

    const stateKey = join(this.appendId, STATE_FILE);
    const stateStream = await this.s3Client.getObjectWrapper(bucket, stateKey);
    stateContent = await streamToString(stateStream);
    this.start = this.fetchSequenceNumber(stateContent);
    this.current = this.start;

    this.logger.info(`start sequence number ${this.start}`);
  }

  public async getEndSequenceNumber(replicationUrl: string): Promise<void> {
    this.logger.info(`getting the end sequence number from remote replication source`);

    const response = await this.replicationClient.getState(replicationUrl);
    this.end = this.fetchSequenceNumber(response.data);

    this.logger.info(`end sequence number ${this.end}`);
  }

  public async getScripts(bucket: string): Promise<void> {
    this.logger.info(`getting scripts from bucket to file system`);

    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(this.appendId, entity.script)));

    const getScriptPromises = scriptsKeys.map(async (scriptKey) => {
      const scriptStream = await this.s3Client.getObjectWrapper(bucket, scriptKey);
      const scriptFileContent = await streamToString(scriptStream);
      const localScriptPath = join(DATA_DIR, scriptKey);
      await createDirectory(getFileDirectory(localScriptPath));
      await fsPromises.writeFile(localScriptPath, scriptFileContent);
    })

    await Promise.all(getScriptPromises);
  }

  public async appendReplications(replicationUrl: string, bucket: string, acl: string): Promise<void> {
    this.logger.info(`${this.appendId} current sequence number ${this.current}`);

    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const appendPromises = this.entities.map(async (entity) => {
      const localScriptPath = join(DATA_DIR, this.appendId, entity.script);
      const expireTilesZoom = this.zoomLevelsToRange(entity.zoomLevel.min, entity.zoomLevel.max);
      const expireTilesFileName = `${entity.id}.${this.current}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.appendId, expireTilesFileName);

      this.logger.info(`initializing the append of ${entity.id}`);

      await this.commandRunner.run('osm2pgsql', '--append', [
        `--style=${localScriptPath}`,
        simplifiedDiffPath,
        `--expire-tiles=${expireTilesZoom}`,
        `--expire-output=${localExpireTilesListPath}`,
      ]);

      this.logger.info(`appending completed for ${entity.id}, uploading expire list`);

      const expireListKey = join(this.appendId, entity.id, this.current.toString(), EXPIRE_LIST);
      const expireTilesListContent = await fsPromises.readFile(localExpireTilesListPath);
      await this.s3Client.putObjectWrapper(bucket, expireListKey, expireTilesListContent, acl);
    });

    await Promise.all(appendPromises);

    this.logger.info(`all appends completed successfuly for state ${this.current}, updating remote state source`);

    stateContent = stateContent.replace(SEQUENCE_NUMBER_REGEX, `sequenceNumber=${++this.current}`);
    const stateBuffer = Buffer.from(stateContent, 'utf-8');
    const stateKey = join(this.appendId, STATE_FILE);
    await this.s3Client.putObjectWrapper(bucket, stateKey, stateBuffer, acl);

    this.logger.info(`remote state source of ${this.appendId} updated successfully, current state ${this.current}`);
  }

  private async getDiffToFs(replicationUrl: string): Promise<string> {
    this.logger.info(`getting osm change file from remote replication source to file system`);

    const [top, bottom, sequenceNumber] = this.getDiffDirPathComponents(this.current);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    const localDiffPath = join(DATA_DIR, `${this.current}.${DIFF_FILE_EXTENTION}`);
    await fsPromises.writeFile(localDiffPath, response.data, { encoding: 'binary' });
    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    this.logger.info(`simplifying osm change file by removing all duplicates`);

    const simplifiedDiffPath = join(DATA_DIR, `${this.current}.simplified.${DIFF_FILE_EXTENTION}`);
    await this.commandRunner.run('osmium', 'merge-changes', ['--simplify', `${diffPath}`, `--output=${simplifiedDiffPath}`]);
    return simplifiedDiffPath;
  }

  private fetchSequenceNumber(content: string): number {
    const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
    if (matchResult === null || matchResult.length === 0) {
      this.logger.error('failed to fetch sequence number out of the state file');
      throw new InvalidStateFileError();
    }
    return parseInt(matchResult[0].split('=')[1]);
  }

  private readonly getDiffDirPathComponents = (sequenceNumber: number): string[] => {
    const top = sequenceNumber / DIFF_TOP_DIR_DIVIDER;
    const bottom = (sequenceNumber % DIFF_TOP_DIR_DIVIDER) / DIFF_BOTTOM_DIR_DIVIDER;
    const state = sequenceNumber % DIFF_STATE_FILE_MODULO;
    return [top, bottom, state].map((component: number) => {
      const floored = Math.floor(component);
      return floored.toString().padStart(SEQUENCE_NUMBER_PAD_AMOUNT, '0');
    });
  };

  private zoomLevelsToRange(min: number, max: number | undefined): string {
    if (max === undefined) {
      return min.toString();
    }
    return `${min}-${max}`;
  }
}
