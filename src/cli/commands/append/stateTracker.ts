import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, singleton } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_SEQUENCE_NUMBER, SEQUENCE_NUMBER_REGEX, SERVICES, STATE_FILE } from '../../../common/constants';
import { BucketDoesNotExistError, InvalidStateFileError } from '../../../common/errors';
import { createDirectory, fetchSequenceNumber, getFileDirectory, streamToString } from '../../../common/util';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { S3ClientWrapper } from '../../../s3Client/s3Client';

let stateContent: string;

@singleton()
export class StateTracker {
  public start = DEFAULT_SEQUENCE_NUMBER;
  public replicationEndState = DEFAULT_SEQUENCE_NUMBER;
  public current = DEFAULT_SEQUENCE_NUMBER;
  public projectId = '';
  private remainingAppends?: number;
  private totalRequestedAppends?: number;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient
  ) {}

  public get nextState(): number {
    return this.current + 1;
  }

  public async prepareEnvironment(projectId: string, limit?: number): Promise<void> {
    this.projectId = projectId;
    if (limit !== undefined) {
      this.totalRequestedAppends = limit;
      this.remainingAppends = limit;
    }

    const dir = join(DATA_DIR, projectId);

    this.logger.debug({ msg: 'creating data directory', path: dir, projectId: this.projectId });
    await createDirectory(dir);

    if (!(await this.s3Client.validateExistance('bucket'))) {
      this.logger.error({ msg: 'configured bucket does not exist', projectId: this.projectId, bucketName: this.s3Client.bucketName });
      throw new BucketDoesNotExistError('the specified bucket does not exist');
    }
  }

  public isUpToDateOrReachedLimit(): boolean {
    if (this.remainingAppends === 0) {
      this.logger.info({ msg: 'append limitation has reached', limitation: this.totalRequestedAppends, projectId: this.projectId });
      return true;
    }
    return this.current === this.replicationEndState;
  }

  public async getStartSequenceNumber(): Promise<void> {
    this.logger.debug({ msg: 'getting the start state from bucket', projectId: this.projectId, bucketName: this.s3Client.bucketName });

    const stateKey = join(this.projectId, STATE_FILE);
    const stateStream = await this.s3Client.getObjectWrapper(stateKey);
    stateContent = await streamToString(stateStream);
    this.start = this.fetchSequenceNumberSafely(stateContent);
    this.current = this.start;

    this.logger.info({
      msg: 'fetched start state from bucket',
      projectId: this.projectId,
      startState: this.start,
      bucketName: this.s3Client.bucketName,
    });
  }

  public async getReplicationSequenceNumber(replicationUrl: string): Promise<void> {
    this.logger.debug({ msg: 'getting end state from remote replication source', projectId: this.projectId, replicationUrl });

    const response = await this.replicationClient.getState(replicationUrl);
    this.replicationEndState = this.fetchSequenceNumberSafely(response.data);

    this.logger.info({
      msg: 'fetched remote replication source end state',
      projectId: this.projectId,
      replicationUrl,
      endState: this.replicationEndState,
    });
  }

  public async getScriptsFromS3ToFs(keys: string[]): Promise<void> {
    this.logger.info({
      msg: 'getting scripts from bucket to file system',
      projectId: this.projectId,
      count: keys.length,
      bucketName: this.s3Client.bucketName,
    });

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
    const fromState = this.current;

    this.logger.info({
      msg: 'attempting to update remote state on configured bucket',
      projectId: this.projectId,
      fromState,
      toState: this.nextState,
      bucketName: this.s3Client.bucketName,
      acl: this.s3Client.acl,
    });

    this.current = this.nextState;
    stateContent = stateContent.replace(SEQUENCE_NUMBER_REGEX, `sequenceNumber=${this.current}`);
    const stateBuffer = Buffer.from(stateContent, 'utf-8');
    const stateKey = join(this.projectId, STATE_FILE);

    await this.s3Client.putObjectWrapper(stateKey, stateBuffer);
  }

  public updateRemainingAppends(): void {
    if (this.totalRequestedAppends !== undefined) {
      this.logger.info({
        msg: 'append status',
        appendNumber: this.totalRequestedAppends - (this.remainingAppends as number) + 1,
        limitation: this.totalRequestedAppends,
        projectId: this.projectId,
      });
      (this.remainingAppends as number)--;
    }
  }

  private fetchSequenceNumberSafely(content: string): number {
    try {
      return fetchSequenceNumber(content);
    } catch (error) {
      this.logger.error({ err: error, msg: 'failed to fetch sequence number out of the state file', projectId: this.projectId });
      throw new InvalidStateFileError('could not fetch sequence number out of the state file');
    }
  }
}
