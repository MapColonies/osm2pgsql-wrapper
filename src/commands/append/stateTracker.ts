import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_SEQUENCE_NUMBER, SEQUENCE_NUMBER_REGEX, SERVICES, STATE_FILE } from '../../common/constants';
import { InvalidStateFileError } from '../../common/errors';
import { createDirectory, fetchSequenceNumber, getFileDirectory, streamToString } from '../../common/util';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { S3ClientWrapper } from '../../s3Client/s3Client';

let stateContent: string;

@injectable()
export class StateTracker {
  public start = DEFAULT_SEQUENCE_NUMBER;
  public end = DEFAULT_SEQUENCE_NUMBER;
  public current = DEFAULT_SEQUENCE_NUMBER;
  public projectId = '';
  private remainingAppends?: number;
  private totalConfiguredAppends?: number;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient
  ) {}

  public async prepareEnvironment(projectId: string, limit?: number): Promise<void> {
    this.logger.info(`preparing environment, project id: ${projectId}`);

    this.projectId = projectId;
    if (limit !== undefined) {
      this.totalConfiguredAppends = limit;
      this.remainingAppends = limit;
    }

    const dir = join(DATA_DIR, projectId);

    this.logger.debug(`creating directory ${dir}`);
    await createDirectory(dir);
  }

  public isUpToDateOrReachedLimit(): boolean {
    if (this.remainingAppends === 0) {
      this.logger.info(`append limitation of ${this.totalConfiguredAppends as number} has reached`);
      return true;
    }
    return this.current === this.end;
  }

  public async getStartSequenceNumber(): Promise<void> {
    this.logger.info(`getting the start sequence number from bucket`);

    const stateKey = join(this.projectId, STATE_FILE);
    const stateStream = await this.s3Client.getObjectWrapper(stateKey);
    stateContent = await streamToString(stateStream);
    this.start = this.fetchSequenceNumberSafely(stateContent);
    this.current = this.start + 1;

    this.logger.info(`start sequence number ${this.start}`);
  }

  public async getEndSequenceNumber(replicationUrl: string): Promise<void> {
    this.logger.info(`getting the end sequence number from remote replication source`);

    const response = await this.replicationClient.getState(replicationUrl);
    this.end = this.fetchSequenceNumberSafely(response.data);

    this.logger.info(`end sequence number ${this.end}`);
  }

  public async getScriptsFromS3ToFs(keys: string[]): Promise<void> {
    this.logger.info(`getting scripts from bucket to file system`);

    const getScriptPromises = keys.map(async (scriptKey) => {
      const scriptStream = await this.s3Client.getObjectWrapper(scriptKey);
      const scriptFileContent = await streamToString(scriptStream);
      const localScriptPath = join(DATA_DIR, scriptKey);
      await createDirectory(getFileDirectory(localScriptPath));
      await fsPromises.writeFile(localScriptPath, scriptFileContent);
    });

    await Promise.all(getScriptPromises);
  }

  public async updateRemoteState(): Promise<void> {
    this.logger.info(`updating remote state from ${this.current} to ${this.current + 1}`);

    stateContent = stateContent.replace(SEQUENCE_NUMBER_REGEX, `sequenceNumber=${this.current}`);
    const stateBuffer = Buffer.from(stateContent, 'utf-8');
    const stateKey = join(this.projectId, STATE_FILE);
    await this.s3Client.putObjectWrapper(stateKey, stateBuffer);
    this.current++;

    this.logger.info(`successfully updated the remote state source of ${this.projectId}, current state ${this.current}`);
  }

  public updateRemainingAppends(): void {
    if (this.totalConfiguredAppends !== undefined) {
      this.logger.info(
        `append number ${this.totalConfiguredAppends - (this.remainingAppends as number) + 1} out of ${this.totalConfiguredAppends} has finished`
      );
      (this.remainingAppends as number)--;
    }
  }

  private fetchSequenceNumberSafely(content: string): number {
    try {
      return fetchSequenceNumber(content);
    } catch (error) {
      this.logger.error('failed to fetch sequence number out of the state file');
      throw new InvalidStateFileError('could not fetch sequence number out of the state file');
    }
  }
}
