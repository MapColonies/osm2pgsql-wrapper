/* eslint-disable @typescript-eslint/naming-convention */ // s3-client object commands arguments
import { inject, Lifecycle, scoped } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadBucketCommandOutput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SERVICES } from '../common/constants';
import { S3Error } from '../common/errors';
import { IConfig } from '../common/interfaces';

type HeadCommandType = 'bucket' | 'object';

const S3_NOT_FOUND_ERROR_NAME = 'NotFound';

@scoped(Lifecycle.ContainerScoped)
export class S3ClientWrapper {
  public readonly bucketName: string;
  public readonly acl: ObjectCannedACL | undefined;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    @inject(SERVICES.CONFIG_STORE) configStore: IConfig
  ) {
    this.bucketName = configStore.get<string>('s3.bucketName');
    this.acl = configStore.get<ObjectCannedACL>('s3.acl');

    this.logger.info({ msg: 'initializing s3 client', bucketName: this.bucketName, acl: this.acl });
  }

  public async getObjectWrapper(key: string): Promise<NodeJS.ReadStream> {
    this.logger.debug({ msg: 'getting object from s3', key, bucketName: this.bucketName });

    try {
      const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
      const commandOutput = await this.s3Client.send(command);
      return commandOutput.Body as unknown as NodeJS.ReadStream;
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error({ err: s3Error, msg: 'failed getting key from bucket', key, bucketName: this.bucketName });
      throw new S3Error(`an error occurred during the get of key ${key} from bucket ${this.bucketName}, ${s3Error.message}`);
    }
  }

  public async putObjectWrapper(key: string, body: Buffer): Promise<void> {
    this.logger.debug({ msg: 'putting key in bucket', key, bucketName: this.bucketName, acl: this.acl });

    try {
      const command = new PutObjectCommand({ Bucket: this.bucketName, Key: key, Body: body, ACL: this.acl });
      await this.s3Client.send(command);
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error({ err: s3Error, msg: 'failed putting key in bucket', acl: this.acl, bucketName: this.bucketName });
      throw new S3Error(`an error occurred during the put of key ${key} on bucket ${this.bucketName}, ${s3Error.message}`);
    }
  }

  public async validateExistance(type: HeadCommandType, keyValue?: string): Promise<boolean> {
    let exists;

    if (type === 'bucket') {
      exists = await this.headBucketWrapper(this.bucketName);
    } else {
      exists = await this.headObjectWrapper(this.bucketName, keyValue as string);
    }

    return exists !== undefined;
  }

  private async headBucketWrapper(bucket: string): Promise<HeadBucketCommandOutput | undefined> {
    this.logger.debug({ msg: 'heading bucket', bucketName: bucket });

    try {
      const command = new HeadBucketCommand({ Bucket: bucket });
      return await this.s3Client.send(command);
    } catch (error) {
      const s3Error = error as Error;
      if (s3Error.name === S3_NOT_FOUND_ERROR_NAME) {
        return undefined;
      }

      this.logger.error({ err: s3Error, msg: 'failed to head bucket', bucketName: bucket });
      throw new S3Error(`an error occurred during head bucket ${bucket}, ${s3Error.message}`);
    }
  }

  private async headObjectWrapper(bucket: string, key: string): Promise<HeadObjectCommandOutput | undefined> {
    this.logger.debug({ msg: 'heading object', key, bucketName: bucket });

    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      return await this.s3Client.send(command);
    } catch (error) {
      const s3Error = error as Error;
      if (s3Error.name === S3_NOT_FOUND_ERROR_NAME) {
        return undefined;
      }

      this.logger.error({ err: s3Error, msg: 'failed to head objcet', bucketName: bucket, key });
      throw new S3Error(`an error occurred during head object with bucket ${bucket} key ${key}, ${s3Error.message}`);
    }
  }
}
