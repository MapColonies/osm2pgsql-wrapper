import { join } from 'path';
import { inject, singleton } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_SEQUENCE_NUMBER, SEQUENCE_NUMBER_REGEX, SERVICES, STATE_FILE, TIMESTAMP_REGEX } from '../../../common/constants';
import { BucketDoesNotExistError, InvalidStateFileError } from '../../../common/errors';
import { createDirectory, fetchSequenceNumber, streamToString } from '../../../common/util';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { S3ClientWrapper } from '../../../s3Client/s3Client';

let stateContent: string;

@singleton()
export class StateTracker {
  public replicationRemoteState = DEFAULT_SEQUENCE_NUMBER;
  public current = DEFAULT_SEQUENCE_NUMBER;
  public projectId = '';
  public totalAppends = 0;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly replicationClient: ReplicationClient
  ) {}

  public get nextState(): number {
    return this.current + 1;
  }

  public async prepareEnvironment(projectId: string): Promise<void> {
    this.projectId = projectId;

    const dir = join(DATA_DIR, projectId);

    this.logger.debug({ msg: 'creating data directory', path: dir, projectId: this.projectId });
    await createDirectory(dir);

    if (!(await this.s3Client.validateExistance('bucket'))) {
      this.logger.error({ msg: 'configured bucket does not exist', projectId: this.projectId, bucketName: this.s3Client.bucketName });
      throw new BucketDoesNotExistError('the specified bucket does not exist');
    }
  }

  public isUpToDate(): boolean {
    return this.current === this.replicationRemoteState;
  }

  public async getStartSequenceNumber(): Promise<void> {
    this.logger.debug({ msg: 'getting the start state from bucket', projectId: this.projectId, bucketName: this.s3Client.bucketName });

    const stateKey = join(this.projectId, STATE_FILE);
    const stateStream = await this.s3Client.getObjectWrapper(stateKey);
    stateContent = await streamToString(stateStream);
    this.current = this.fetchSequenceNumberSafely(stateContent);

    this.logger.info({
      msg: 'fetched start state from bucket',
      projectId: this.projectId,
      startState: this.current,
      bucketName: this.s3Client.bucketName,
    });
  }

  public async getReplicationSequenceNumber(replicationUrl: string): Promise<void> {
    this.logger.debug({ msg: 'getting end state from remote replication source', projectId: this.projectId, replicationUrl });

    const response = await this.replicationClient.getState(replicationUrl);
    this.replicationRemoteState = this.fetchSequenceNumberSafely(response.data);

    this.logger.info({
      msg: 'fetched remote replication source end state',
      projectId: this.projectId,
      replicationUrl,
      endState: this.replicationRemoteState,
    });
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
    this.totalAppends++;
  }

  public async updateRemoteTimestamp(): Promise<void> {
    const updatedTimestamp = new Date()
      .toISOString()
      .replace(/\.\d+Z$/, 'Z')
      .replace(/:/g, '\\:');

    this.logger.info({
      msg: 'attempting to update remote timestamp on configured bucket',
      projectId: this.projectId,
      currentState: this.current,
      toState: this.nextState,
      bucketName: this.s3Client.bucketName,
      acl: this.s3Client.acl,
      updatedTimestamp,
    });

    stateContent = stateContent.replace(TIMESTAMP_REGEX, `timestamp=${updatedTimestamp}`);
    const stateBuffer = Buffer.from(stateContent, 'utf-8');
    const stateKey = join(this.projectId, STATE_FILE);

    await this.s3Client.putObjectWrapper(stateKey, stateBuffer);
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
