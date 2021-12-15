import { join } from 'path';
import { existsSync } from 'fs';
import { Argv, CommandModule, Arguments } from 'yargs';
import { isWebUri } from 'valid-url';
import { Logger } from '@map-colonies/js-logger';
import { container, delay, inject, injectable } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../common/constants';
import { ErrorWithExitCode } from '../../common/errors';
import { CreateManager } from './createManager';

enum DumpSourceType {
  LOCAL_FILE = 'local-file',
  REMOTE_URL = 'remote-url',
  DUMP_SERVER = 'dump-server',
}

export interface CreateArguments extends GlobalArguments {
  dumpSourceType: DumpSourceType;
  dumpSource: string;
  s3ScriptKey: string;
}

@injectable()
export class CreateCommand implements CommandModule<GlobalArguments, CreateArguments> {
  public command = 'create';
  public describe = 'initialize a database from scratch by creating it out of an osm pbf file';

  public constructor(
    @inject(delay(() => CreateManager)) private readonly manager: CreateManager,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public builder = (yargs: Argv<GlobalArguments>): Argv<CreateArguments> => {
    yargs
      .option('dumpSourceType', {
        alias: ['t', 'dump-source-type'],
        describe: 'The source type of the dump',
        choices: [DumpSourceType.LOCAL_FILE, DumpSourceType.REMOTE_URL, DumpSourceType.DUMP_SERVER],
        demandOption: true,
      })
      .option('dumpSource', {
        alias: ['s', 'dump-source'],
        description: 'The source of the pbf dump file, could be one of the options of dump-source-type',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('s3ScriptKey', { alias: ['l', 's3-lua-script-key'], describe: 'The lua script key', nargs: 1, type: 'string', demandOption: true })
      .check((argv) => {
        const { dumpSourceType, dumpSource } = argv;

        const errorPrefix = `provided dump source of type ${dumpSourceType} is not valid`;

        if (dumpSourceType === DumpSourceType.LOCAL_FILE) {
          if (!existsSync(dumpSource)) {
            throw new Error(`${errorPrefix}, ${dumpSource} does not exist locally`);
          }
        } else if (isWebUri(dumpSource) === undefined) {
          throw new Error(`${errorPrefix}, ${dumpSource} is not a valid web uri`);
        }

        return true;
      });
    return yargs as Argv<CreateArguments>;
  };

  public handler = async (argv: Arguments<CreateArguments>): Promise<void> => {
    const { s3KeyId, s3ScriptKey, s3BucketName, dumpSourceType, dumpSource } = argv;
    const scriptKey = join(s3KeyId, s3ScriptKey);

    try {
      const localScriptPath = await this.manager.getScriptFromS3ToFs(s3BucketName, scriptKey);

      let localDumpPath = dumpSource;

      if (dumpSourceType !== DumpSourceType.LOCAL_FILE) {
        let remoteDumpUrl = dumpSource;
        if (dumpSourceType === DumpSourceType.DUMP_SERVER) {
          const { url } = await this.manager.getLatestFromDumpServer(dumpSource);
          remoteDumpUrl = url;
        }
        localDumpPath = await this.manager.getDumpFromRemoteToFs(remoteDumpUrl);
      }

      await this.manager.creation(localScriptPath, localDumpPath);
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        this.logger.error((error as Error).message);
      }

      container.register(EXIT_CODE, { useValue: exitCode });
      this.logger.warn(`an error occurred, exiting with code ${exitCode}`);
    }
  };
}
