import { S3ClientWrapper } from '../s3Client/s3Client';
import { streamToString } from '../common/util';
import { IResourceProvider } from './resourceProvider';

export class S3RemoteResourceProvider implements IResourceProvider {
  public constructor(private readonly s3Client: S3ClientWrapper) {}

  public async getResource(id: string): Promise<string> {
    const stream = await this.s3Client.getObjectWrapper(id);
    return streamToString(stream);
  }
}
