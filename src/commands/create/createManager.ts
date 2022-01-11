import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_DUMP_NAME, SERVICES } from '../../common/constants';
import { createDirectory, getFileDirectory, streamToFs } from '../../common/util';
import { DumpClient, DumpMetadataResponse } from '../../httpClient/dumpClient';
import { S3ClientWrapper } from '../../s3Client/s3Client';
import { CommandRunner } from '../../common/commandRunner';
import { DumpServerEmptyResponseError, Osm2pgsqlError } from '../../common/errors';

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

    const localScriptPath = join(DATA_DIR, scriptKey);
    await createDirectory(getFileDirectory(localScriptPath));
    await fsPromises.writeFile(localScriptPath, scriptStream);

    return localScriptPath;
  }

  public async getLatestFromDumpServer(dumpServerUrl: string): Promise<DumpMetadataResponse> {
    this.logger.info(`getting the latest dump from dump-server`);

    const dumpServerResponse = await this.dumpClient.getDumpsMetadata(dumpServerUrl, { limit: 1, sort: 'desc' });
    if (dumpServerResponse.data.length === 0) {
      this.logger.error(`received empty dumps response, url: ${dumpServerUrl}`);
      throw new DumpServerEmptyResponseError(`received empty dumps response from dump-server`);
    }

    return dumpServerResponse.data[0];
  }

  public async getDumpFromRemoteToFs(url: string, name = DEFAULT_DUMP_NAME): Promise<string> {
    this.logger.info(`getting dump from remote service`);

    const localDumpPath = join(DATA_DIR, name);
    const response = await this.dumpClient.getDump(url);
    await streamToFs(response.data, localDumpPath);
    return localDumpPath;
  }

  public async creation(scriptPath: string, dumpPath: string): Promise<void> {
    const executable = 'osm2pgsql';
    const { exitCode } = await this.commandRunner.run(executable, '--create', [`--style=${scriptPath}`, dumpPath]);

    if (exitCode !== 0) {
      this.logger.error(`${executable} exit with code ${exitCode as number}`);
      throw new Osm2pgsqlError(`an error occurred while running ${executable}, exit code ${exitCode as number}`);
    }
  }
}
