/* eslint-disable @typescript-eslint/naming-convention */ // due to @aws-sdk/client-s3 command arguments
import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { $ } from 'zx';
import { Logger } from '@map-colonies/js-logger';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  DATA_DIR,
  OSM2PGSQL_PATH,
  SERVICES,
  DEFAULT_SEQUENCE_NUMBER,
  SEQUENCE_NUMBER_REGEX,
  DIFF_TOP_DIR_DIVIDER,
  DIFF_BOTTOM_DIR_DIVIDER,
  DIFF_STATE_FILE_MODULO,
  DIFF_FILE_EXTENTION,
  STATE_FILE,
  EXPIRE_LIST,
  OSMIUM_PATH,
  SEQUENCE_NUMBER_PAD_AMOUNT,
} from '../../common/constants';
import { createDirectory, removeDuplicates, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { AppendEntity } from '../../validation/schema';

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
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    private readonly replicationClient: ReplicationClient
  ) {}

  public async prepareManager(id: string, entities: AppendEntity[]): Promise<void> {
    this.appendId = id;
    await createDirectory(join(DATA_DIR, id));
    this.entities = entities;
  }

  public isUpToDate(): boolean {
    return this.current === this.end;
  }

  public async getStartSequenceNumber(bucket: string): Promise<void> {
    try {
      const key = join(this.appendId, STATE_FILE);
      const commandOutput = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      if (commandOutput.Body === undefined) {
        throw Error();
      }

      stateContent = await streamToString(commandOutput.Body as NodeJS.ReadStream);
      this.start = this.fetchSequenceNumber(stateContent);
      this.current = this.start;
      this.logger.info(`start sequenceNumber ${this.start}`);
    } catch (error) {
      console.log(error);
    }
  }

  public async getEndSequenceNumber(replicationUrl: string): Promise<void> {
    try {
      const response = await this.replicationClient.getState(replicationUrl);
      this.end = this.fetchSequenceNumber(response.data);
      this.logger.info(`end sequenceNumber ${this.end}`);
    } catch (error) {
      console.log(error);
    }
  }

  public async getScripts(bucket: string): Promise<void> {
    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(this.appendId, entity.script)));
    for await (const scriptKey of scriptsKeys) {
      const commandOutput = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: scriptKey }));
      if (commandOutput.Body === undefined) {
        throw Error();
      }
      const scriptFileContent = await streamToString(commandOutput.Body as NodeJS.ReadStream);
      const localPath = join(DATA_DIR, scriptKey);
      await createDirectory(localPath);
      await fsPromises.writeFile(localPath, scriptFileContent);
    }
  }

  public async appendReplications(replicationUrl: string, bucket: string, acl: string): Promise<void> {
    const diffPath = await this.getDiffToFs(replicationUrl);

    const simplifiedDiffPath = await this.simplifyDiff(diffPath);

    const promises = this.entities.map(async (entity) => {
      this.logger.info(entity);
      const localScriptPath = join(DATA_DIR, this.appendId, entity.script);
      const expireTilesZoom = this.zoomLevelsToRange(entity.zoomLevel.min, entity.zoomLevel.max);
      const expireTilesFileName = `${entity.id}.${this.current}.${EXPIRE_LIST}`;
      const localExpireTilesListPath = join(DATA_DIR, this.appendId, expireTilesFileName);

      await $`${OSM2PGSQL_PATH} \
        --append \
        --slim \
        --multi-geometry \
        --style=${localScriptPath} \
        --cache=2500 \
        --number-processes 2 \
        ${simplifiedDiffPath} \
        --output=flex \
        --expire-tiles=${expireTilesZoom} \
        --expire-output=${localExpireTilesListPath}`;

      const expireListKey = join(this.appendId, entity.id, this.current.toString(), EXPIRE_LIST);
      console.log(expireListKey);
      const expireTilesListContent = await fsPromises.readFile(localExpireTilesListPath);
      await this.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: expireListKey, Body: expireTilesListContent, ACL: acl }));
    });

    await Promise.all(promises);
    stateContent = stateContent.replace(SEQUENCE_NUMBER_REGEX, `sequenceNumber=${++this.current}`);
    const stateKey = join(this.appendId, STATE_FILE);
    await this.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: stateKey, Body: stateContent, ACL: acl }));
  }

  private async getDiffToFs(replicationUrl: string): Promise<string> {
    const [top, bottom, sequenceNumber] = this.getDiffDirPathComponents(this.current);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    const localDiffPath = join(DATA_DIR, `${this.current}.${DIFF_FILE_EXTENTION}`);
    await fsPromises.writeFile(localDiffPath, response.data, { encoding: 'binary' });
    return localDiffPath;
  }

  private async simplifyDiff(diffPath: string): Promise<string> {
    const simplifiedDiffPath = join(DATA_DIR, `${this.current}.simplified.${DIFF_FILE_EXTENTION}`);
    await $`${OSMIUM_PATH} merge-changes --simplify ${diffPath} --output ${simplifiedDiffPath}`;
    return simplifiedDiffPath;
  }

  private fetchSequenceNumber(content: string): number {
    const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
    if (matchResult === null || matchResult.length === 0) {
      this.logger.error('error');
      throw new Error();
      // throw new ErrorWithExitCode(`failed to fetch sequence number out of the state file`, ExitCodes.INVALID_STATE_FILE_ERROR);
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
