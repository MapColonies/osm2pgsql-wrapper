import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_DUMP_NAME, SERVICES } from '../../../common/constants';
import { createDirectory, getFileDirectory, streamToFs } from '../../../common/util';
import { DumpClient, DumpMetadataResponse } from '../../../httpClient/dumpClient';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { BucketDoesNotExistError, DumpServerEmptyResponseError } from '../../../common/errors';
import { OsmCommandRunner } from '../../../commandRunner/OsmCommandRunner';
import { DumpSourceType } from './constants';

export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly s3Client: S3ClientWrapper,
    private readonly dumpClient: DumpClient,
    private readonly osmCommandRunner: OsmCommandRunner
  ) {}

  public async create(projectId: string, luaScriptKey: string, dumpSource: string, dumpSourceType: DumpSourceType): Promise<void> {
    const scriptKey = join(projectId, luaScriptKey);

    const localScriptPath = await this.getScriptFromS3ToFs(scriptKey);

    let localDumpPath = dumpSource;

    if (dumpSourceType !== DumpSourceType.LOCAL_FILE) {
      const remoteDumpUrl = dumpSourceType === DumpSourceType.DUMP_SERVER ? (await this.getLatestFromDumpServer(dumpSource)).url : dumpSource;
      localDumpPath = await this.getDumpFromRemoteToFs(remoteDumpUrl);
    }

    await this.osmCommandRunner.create([`--style=${localScriptPath}`, localDumpPath]);
  }

  private async getScriptFromS3ToFs(scriptKey: string): Promise<string> {
    this.logger.info(`getting script from s3 to file system`);

    if (!(await this.s3Client.validateExistance('bucket'))) {
      this.logger.error('the specified bucket does not exists');
      throw new BucketDoesNotExistError('the specified bucket does not exist');
    }

    const scriptStream = await this.s3Client.getObjectWrapper(scriptKey);
    const localScriptPath = join(DATA_DIR, scriptKey);
    await createDirectory(getFileDirectory(localScriptPath));
    await fsPromises.writeFile(localScriptPath, scriptStream);

    return localScriptPath;
  }

  private async getLatestFromDumpServer(dumpServerUrl: string): Promise<DumpMetadataResponse> {
    this.logger.info(`getting the latest dump from dump-server`);

    const dumpServerResponse = await this.dumpClient.getDumpsMetadata(dumpServerUrl, { limit: 1, sort: 'desc' });
    if (dumpServerResponse.data.length === 0) {
      this.logger.error(`received empty dumps response, url: ${dumpServerUrl}`);
      throw new DumpServerEmptyResponseError(`received empty dumps response from dump-server`);
    }

    return dumpServerResponse.data[0];
  }

  private async getDumpFromRemoteToFs(url: string, name = DEFAULT_DUMP_NAME): Promise<string> {
    this.logger.info(`getting dump from remote service`);

    const localDumpPath = join(DATA_DIR, name);
    const response = await this.dumpClient.getDump(url);
    await streamToFs(response.data, localDumpPath);
    return localDumpPath;
  }
}
