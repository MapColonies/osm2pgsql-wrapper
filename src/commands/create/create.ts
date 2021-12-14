import { join } from 'path';
import { existsSync } from 'fs';
import { Argv, CommandModule, Arguments } from 'yargs';
import { Logger } from '@map-colonies/js-logger';
import { container, delay, inject, injectable } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { isStringEmptyOrUndefined } from '../../common/util';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../common/constants';
import { DumpServerEmptyResponseError, Osm2pgsqlError, S3Error, HttpUpstreamUnavailableError, HttpUpstreamResponseError } from '../../common/errors';
import { CreateManager } from './createManager';

enum DumpSource {
  LOCAL_FILE = 'local-file',
  REMOTE_URL = 'remote-url',
  DUMP_SERVER = 'dump-server',
}

export interface CreateArguments extends GlobalArguments {
  source: DumpSource;
  s3ScriptKey: string;
  dumpLocalFile?: string;
  dumpRemoteUrl?: string;
  dumpServerUrl?: string;
}

@injectable()
export class CreateCommand implements CommandModule<GlobalArguments, CreateArguments> {
  public command = 'create';
  public describe = 'initialize a database from scratch by creating it out of an osm pbf file';
  private dumpSource?: string;

  public constructor(
    @inject(delay(() => CreateManager)) private readonly manager: CreateManager,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public builder = (yargs: Argv<GlobalArguments>): Argv<CreateArguments> => {
    yargs
      .option('source', {
        alias: 's',
        describe: 'The source of the dump file',
        choices: [DumpSource.LOCAL_FILE, DumpSource.REMOTE_URL, DumpSource.DUMP_SERVER],
        demandOption: true,
      })
      .option('dumpLocalFile', { alias: ['f', 'dump-local-file'], description: 'The local path to a pbf dump file', nargs: 1, type: 'string' })
      .option('dumpRemoteUrl', { alias: ['r', 'dump-remote-url'], description: 'The remote dump file url', nargs: 1, type: 'string' })
      .option('dumpServerUrl', { alias: ['u', 'dump-server-url'], describe: 'The dump-server url', nargs: 1, type: 'string' })
      .option('s3ScriptKey', { alias: ['l', 's3-lua-script-key'], describe: 'The lua script key', nargs: 1, type: 'string', demandOption: true })
      .check((argv) => {
        const { dumpLocalFile, dumpRemoteUrl, dumpServerUrl, source } = argv;
        switch (source) {
          case DumpSource.LOCAL_FILE:
            this.dumpSource = dumpLocalFile;
            if (isStringEmptyOrUndefined(dumpLocalFile) || !existsSync(dumpLocalFile as string)) {
              throw new Error('provided path to pbf file is not valid');
            }
            return true;
          case DumpSource.REMOTE_URL:
            this.dumpSource = dumpRemoteUrl;
            break;
          case DumpSource.DUMP_SERVER:
            this.dumpSource = dumpServerUrl;
            break;
        }

        if (isStringEmptyOrUndefined(this.dumpSource)) {
          throw new Error('please provide dump source');
        }

        return true;
      });
    return yargs as Argv<CreateArguments>;
  };

  public handler = async (argv: Arguments<CreateArguments>): Promise<void> => {
    const { s3KeyId, s3ScriptKey, s3BucketName, dumpLocalFile, source } = argv;
    const scriptKey = join(s3KeyId, s3ScriptKey);

    try {
      const scriptPath = await this.manager.getScriptFromS3ToFs(s3BucketName, scriptKey);

      let dumpPath = dumpLocalFile;
      if (source === DumpSource.REMOTE_URL) {
        dumpPath = await this.manager.getDumpFromRemoteToFs(this.dumpSource as string);
      } else if (source === DumpSource.DUMP_SERVER) {
        dumpPath = await this.manager.getFromDumpServerToFs(this.dumpSource as string);
      }

      await this.manager.creation(scriptPath, dumpPath as string);
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof S3Error) {
        exitCode = ExitCodes.S3_ERROR;
      } else if (error instanceof HttpUpstreamUnavailableError) {
        exitCode = ExitCodes.REMOTE_SERVICE_UNAVAILABLE;
      } else if (error instanceof HttpUpstreamResponseError) {
        exitCode = ExitCodes.REMOTE_SERVICE_RESPONSE_ERROR;
      } else if (error instanceof DumpServerEmptyResponseError) {
        exitCode = ExitCodes.DUMP_SERVER_EMPTY_RESPONSE_ERROR;
      } else if (error instanceof Osm2pgsqlError) {
        exitCode = ExitCodes.OSM2PGSQL_ERROR;
      }
      container.register(EXIT_CODE, { useValue: exitCode });
    }
  };
}
