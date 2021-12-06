import { $ } from 'zx';
import { inject, injectable } from 'tsyringe';
import { join } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { DATA_DIR, OSM2PGSQL_PATH, SERVICES, DEFAULT_SEQUENCE_NUMBER, SEQUENCE_NUMBER_REGEX, ExitCodes } from '../../common/constants';
import { Logger } from '@map-colonies/js-logger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createDirectory, removeDuplicates, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { AppendEntity } from '../../validation/schema';

@injectable()
export class AppendManager {
  private currentSequenceNumber = DEFAULT_SEQUENCE_NUMBER;
  private replicationSequenceNumber = DEFAULT_SEQUENCE_NUMBER;
  private entities: AppendEntity[] = [];

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    private readonly replicationClient: ReplicationClient) { }

  public setEntities(entities: AppendEntity[]): void {
    this.entities = entities;
  }

  public isUpToDate(): boolean {
    return this.currentSequenceNumber === this.replicationSequenceNumber;
  }

  public async getCurrentSequenceNumber(bucket: string, key: string): Promise<void> {
    try {
      const commandOutput = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      if (commandOutput.Body === undefined) {
        throw Error();
      }

      const currentStateContent = await streamToString(commandOutput.Body as NodeJS.ReadStream);
      this.currentSequenceNumber = this.fetchSequenceNumber(currentStateContent);
    } catch (error) {
      console.log(error)
    }
  }

  public async getReplicationSequenceNumber(replicationUrl: string): Promise<void> {
    try {
      const replicationStateContentResponse = await this.replicationClient.getState(replicationUrl);
      this.replicationSequenceNumber = this.fetchSequenceNumber(replicationStateContentResponse.data);
    } catch (error) {
      console.log(error);
    }
  }

  public async getScripts(bucket: string, key: string): Promise<void> {
    const scriptsKeys = removeDuplicates(this.entities.map(entity => join(key, entity.script)));
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

  public async append(scriptPath: string, dumpPath: string): Promise<void> {
    this.logger.info('appending');
  }

  private fetchSequenceNumber(content: string): string {
    const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
    if (matchResult === null || matchResult.length === 0) {
      this.logger.error('error');
      throw new Error();
      // throw new ErrorWithExitCode(`failed to fetch sequence number out of the state file`, ExitCodes.INVALID_STATE_FILE_ERROR);
    }
    return matchResult[0].split('=')[1];
  }
}
