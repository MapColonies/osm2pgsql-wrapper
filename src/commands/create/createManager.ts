import { $ } from 'zx';
import { inject, injectable } from 'tsyringe';
import { join } from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { DATA_DIR, OSM2PGSQL_PATH, SERVICES } from '../../common/constants';
import { Logger } from '@map-colonies/js-logger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createDirectory, streamToString } from '../../common/util';

@injectable()
export class CreateManager {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.S3) private readonly s3Client: S3Client) {}

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
