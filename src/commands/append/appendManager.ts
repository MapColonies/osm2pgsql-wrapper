import { $ } from 'zx';
import { inject, injectable } from 'tsyringe';
import { join } from 'path';
import fsPromises from 'fs/promises';
import {
  DATA_DIR,
  OSM2PGSQL_PATH,
  SERVICES,
  DEFAULT_SEQUENCE_NUMBER,
  SEQUENCE_NUMBER_REGEX,
  ExitCodes,
  DIFF_TOP_DIR_DIVIDER,
  DIFF_BOTTOM_DIR_DIVIDER,
  DIFF_STATE_FILE_MODULO,
  DIFF_FILE_EXTENTION,
} from '../../common/constants';
import { Logger } from '@map-colonies/js-logger';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createDirectory, removeDuplicates, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { AppendEntity } from '../../validation/schema';

// TODO: get from config instead of args
@injectable()
export class AppendManager {
  private start = DEFAULT_SEQUENCE_NUMBER;
  private end = DEFAULT_SEQUENCE_NUMBER;
  private current = DEFAULT_SEQUENCE_NUMBER;
  private entities: AppendEntity[] = [];

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    private readonly replicationClient: ReplicationClient
  ) {}

  public setEntities(entities: AppendEntity[]): void {
    this.entities = entities;
  }

  public isUpToDate(): boolean {
    return this.current === this.end;
  }

  public async getStartSequenceNumber(bucket: string, key: string): Promise<void> {
    try {
      const commandOutput = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      if (commandOutput.Body === undefined) {
        throw Error();
      }

      const currentStateContent = await streamToString(commandOutput.Body as NodeJS.ReadStream);
      this.start = this.fetchSequenceNumber(currentStateContent);
      this.current = this.start;
    } catch (error) {
      console.log(error);
    }
  }

  public async getEndSequenceNumber(replicationUrl: string): Promise<void> {
    try {
      const response = await this.replicationClient.getState(replicationUrl);
      this.end = this.fetchSequenceNumber(response.data);
    } catch (error) {
      console.log(error);
    }
  }

  public async getScripts(bucket: string, key: string): Promise<void> {
    const scriptsKeys = removeDuplicates(this.entities.map((entity) => join(key, entity.script)));
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

  public async job(replicationUrl: string): Promise<void> {
    // while (this.current > this.end) {
    const [top, bottom, sequenceNumber] = this.getDiffDirPathComponents(this.current);
    const diffKey = join(top, bottom, `${sequenceNumber}.${DIFF_FILE_EXTENTION}`);
    const response = await this.replicationClient.getDiff(replicationUrl, diffKey);
    const localDiffPath = join(DATA_DIR, `${this.current}.${DIFF_FILE_EXTENTION}`);
    await fsPromises.writeFile(localDiffPath, response.data, { encoding: 'binary' });

    this.entities.map(async (entity) => {
      const localScriptPath = join(DATA_DIR, entity.script);
      const expireTilesZoom = this.zoomLevelsToRange(entity.zoomLevel.min, entity.zoomLevel.max);
      const expireTilesFileName = `${entity.id}-${this.current}-expire.list`;
      const localExpireTilesListPath = join(DATA_DIR, expireTilesFileName);

      await $`${OSM2PGSQL_PATH} \
          --append \
          --slim \
          --multi-geometry \
          --style=${localScriptPath} \
          --cache=2500 \
          --number-processes 2 \
          ${localDiffPath} \
          --output=flex \
          --expire-tiles=${expireTilesZoom} \
          --expire-output=${localExpireTilesListPath}`;

      const expireTilesListContent = await fsPromises.readFile(localExpireTilesListPath);
      // await this.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: expireTilesListContent, ACL: acl }));
      // await putObjectWrapper(s3Client, s3BucketName, `${s3KeyId}/${entity.id}/${expireTilesFileName}`, expireTilesListContent, s3Acl);
    });
    this.current++;
    // }
  }

  public async append(scriptPath: string, dumpPath: string): Promise<void> {
    this.logger.info('appending');
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

  private getDiffDirPathComponents = (sequenceNumber: number): string[] => {
    const top = sequenceNumber / DIFF_TOP_DIR_DIVIDER;
    const bottom = (sequenceNumber % DIFF_TOP_DIR_DIVIDER) / DIFF_BOTTOM_DIR_DIVIDER;
    const state = sequenceNumber % DIFF_STATE_FILE_MODULO;
    return [top, bottom, state].map((component: number) => {
      const floored = Math.floor(component);
      return floored.toString().padStart(3, '0');
    });
  };

  private zoomLevelsToRange(min: number, max: number | undefined): string {
    if (max === undefined) return min.toString();
    return `${min}-${max}`;
  }
}
