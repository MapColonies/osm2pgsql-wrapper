/* eslint-disable @typescript-eslint/naming-convention */ // s3-client object commands arguments
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { GetObjectCommand, ObjectCannedACL, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SERVICES } from '../common/constants';
import { S3Error } from '../common/errors';

@injectable()
export class S3ClientWrapper {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.S3) private readonly s3Client: S3Client) {}

  public async getObjectWrapper(bucket: string, key: string): Promise<NodeJS.ReadStream> {
    this.logger.info(`getting key ${key} from bucket ${bucket}`);

    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const commandOutput = await this.s3Client.send(command);
      return commandOutput.Body as NodeJS.ReadStream;
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error(s3Error);
      throw new S3Error(`an error occurred during the get of key ${key} from bucket ${bucket}, ${s3Error.message}`);
    }
  }

  public async putObjectWrapper(bucket: string, key: string, body: Buffer, acl?: ObjectCannedACL | string): Promise<void> {
    this.logger.info(`putting key ${key} in bucket ${bucket} with ${acl !== undefined ? acl : `default`} acl`);

    try {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ACL: acl });
      await this.s3Client.send(command);
    } catch (error) {
      const s3Error = error as Error;
      this.logger.error(s3Error);
      throw new S3Error(`an error occurred during the put of key ${key} on bucket ${bucket}, ${s3Error.message}`);
    }
  }
}
