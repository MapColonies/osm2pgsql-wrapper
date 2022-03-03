/* eslint-disable @typescript-eslint/naming-convention */ // s3-client object commands arguments
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { GetObjectCommand, ObjectCannedACL, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SERVICES } from '../common/constants';
import { S3Error } from '../common/errors';
import { IConfig } from '../common/interfaces';

@injectable()
export class S3ClientWrapper {
  private readonly bucket: string;
  private readonly acl: ObjectCannedACL | undefined;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    @inject(SERVICES.CONFIG_STORE) configStore: IConfig
  ) {
    this.bucket = configStore.get<string>('s3.bucketName');
    this.acl = configStore.get<ObjectCannedACL>('s3.acl');
  }

  public async getObjectWrapper(key: string): Promise<NodeJS.ReadStream> {
    this.logger.info(`getting key ${key} from bucket ${this.bucket}`);

    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const commandOutput = await this.s3Client.send(command);
      return commandOutput.Body as NodeJS.ReadStream;
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error(s3Error);
      throw new S3Error(`an error occurred during the get of key ${key} from bucket ${this.bucket}, ${s3Error.message}`);
    }
  }

  public async putObjectWrapper(key: string, body: Buffer): Promise<void> {
    this.logger.info(`putting key ${key} in bucket ${this.bucket} with ${this.acl !== undefined ? this.acl : `default`} acl`);

    try {
      const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ACL: this.acl });
      await this.s3Client.send(command);
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error(s3Error);
      throw new S3Error(`an error occurred during the put of key ${key} on bucket ${this.bucket}, ${s3Error.message}`);
    }
  }
}
