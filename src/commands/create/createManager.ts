/* eslint-disable @typescript-eslint/naming-convention */ // due to @aws-sdk/client-s3 command arguments
import { join } from 'path';
import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { $ } from 'zx';
import { Logger } from '@map-colonies/js-logger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DATA_DIR, OSM2PGSQL_PATH, SERVICES } from '../../common/constants';
import { createDirectory, streamToString } from '../../common/util';
import { DumpClient } from '../../httpClient/dumpClient';

@injectable()
export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.S3) private readonly s3Client: S3Client,
    private readonly dumpClient: DumpClient
  ) {}

  public async getScriptFromS3ToFs(bucket: string, key: string): Promise<string> {
    let scriptFileContent = '';
    try {
      const output = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      if (output.Body === undefined) {
        throw Error();
      }

      scriptFileContent = await streamToString(output.Body as NodeJS.ReadStream);
    } catch (error) {
      console.log(error);
      throw new Error(error as string);
    }
    const localScriptPath = join(DATA_DIR, key);
    await createDirectory(localScriptPath);
    await fsPromises.writeFile(localScriptPath, scriptFileContent);
    return localScriptPath;
  }

  public async getFromDumpServerToFs(dumpServerUrl: string): Promise<string> {
    const dumpsResponse = await this.dumpClient.getDumpsMetadata(dumpServerUrl, { limit: 1, sort: 'desc' });
    const latest = dumpsResponse.data[0];
    const response = await this.dumpClient.getDump(latest.url);
    const localDumpPath = join(DATA_DIR, `${latest.name}`);
    await fsPromises.writeFile(localDumpPath, response.data, { encoding: 'binary' });
    return localDumpPath;
  }

  public async creation(scriptPath: string, dumpPath: string): Promise<void> {
    this.logger.info('creating');
    await $`${OSM2PGSQL_PATH} \
            --create \
            --slim \
            --multi-geometry \
            --style=${scriptPath} \
            --cache=2500 \
            --number-processes=2 \
            --output=flex \
            ${dumpPath}`;
  }
}
