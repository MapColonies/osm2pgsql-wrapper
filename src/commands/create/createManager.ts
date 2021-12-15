import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_DUMP_NAME, SERVICES } from '../../common/constants';
import { createDirectory, getFileDirectory, streamToString } from '../../common/util';
import { DumpClient, DumpMetadataResponse } from '../../httpClient/dumpClient';
import { S3ClientWrapper } from '../../s3Client/s3Client';
import { CommandRunner } from '../../common/commandRunner';
import { DumpServerEmptyResponseError } from '../../common/errors';

@injectable()
export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly dumpClient: DumpClient,
    private readonly commandRunner: CommandRunner
  ) {}

  public async getScriptFromS3ToFs(bucket: string, scriptKey: string): Promise<string> {
    this.logger.info(`getting script from s3 to file system`);

    const scriptStream = await this.s3Client.getObjectWrapper(bucket, scriptKey);
    const scriptFileContent = await streamToString(scriptStream);

    const localScriptPath = join(DATA_DIR, scriptKey);
    await createDirectory(getFileDirectory(localScriptPath));
    await fsPromises.writeFile(localScriptPath, scriptFileContent);

    return localScriptPath;
  }

  public async getLatestFromDumpServer(dumpServerUrl: string): Promise<DumpMetadataResponse> {
    this.logger.info(`getting the latest dump from dump-server`);

    const dumpServerResponse = await this.dumpClient.getDumpsMetadata(dumpServerUrl, { limit: 1, sort: 'desc' });
    if (dumpServerResponse.data.length === 0) {
      this.logger.error(`recieved empty dumps response, url: ${dumpServerUrl}`);
      throw new DumpServerEmptyResponseError(`recieved empty dumps response from dump-server`);
    }

    return dumpServerResponse.data[0];
  }

  public async getDumpFromRemoteToFs(url: string, name = DEFAULT_DUMP_NAME): Promise<string> {
    this.logger.info(`getting dump from remote service`);

    const response = await this.dumpClient.getDump(url);
    const localDumpPath = join(DATA_DIR, name);
    await fsPromises.writeFile(localDumpPath, response.data, { encoding: 'binary' });

    return localDumpPath;
  }

  public async creation(scriptPath: string, dumpPath: string): Promise<void> {
    await this.commandRunner.run('osm2pgsql', '--create', [`--style=${scriptPath}`, dumpPath]);
  }
}
