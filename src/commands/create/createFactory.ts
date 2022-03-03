import { join } from 'path';
import { existsSync } from 'fs';
import { Argv, CommandModule, Arguments } from 'yargs';
import { isWebUri } from 'valid-url';
import { Logger } from '@map-colonies/js-logger';
import { container, delay, FactoryFunction, inject, injectable } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../common/constants';
import { ErrorWithExitCode } from '../../common/errors';
import { CreateManager } from './createManager';

enum DumpSourceType {
  LOCAL_FILE = 'local-file',
  REMOTE_URL = 'remote-url',
  DUMP_SERVER = 'dump-server',
}

export const CREATE_COMMAND_FACTORY = Symbol('CreateCommandFactory');

export interface CreateArguments extends GlobalArguments {
  dumpSourceType: DumpSourceType;
  dumpSource: string;
  s3LuaScriptKey: string;
}

export const createCommandFactory: FactoryFunction<CommandModule<GlobalArguments, CreateArguments>> = (dependencyContainer) => {
  const command = 'create';

  const describe = 'initialize a database from scratch by creating it out of an osm pbf file';

  const builder = (yargs: Argv<GlobalArguments>): Argv<CreateArguments> => {
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
      .option('s3LuaScriptKey', {
        alias: ['l', 's3-lua-script-key'],
        describe: 'The lua script key in s3',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
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

  const handler = (argv: Arguments<CreateArguments>): void => {
    const { s3ProjectId, s3LuaScriptKey, s3BucketName, dumpSourceType, dumpSource } = argv;
    const scriptKey = join(s3ProjectId, s3LuaScriptKey);

    // TODO: transfer buisness logic to manager
    try {
      // const localScriptPath = await this.manager.getScriptFromS3ToFs(s3BucketName, scriptKey);
      // let localDumpPath = dumpSource;
      // if (dumpSourceType !== DumpSourceType.LOCAL_FILE) {
      //     const remoteDumpUrl =
      //         dumpSourceType === DumpSourceType.DUMP_SERVER ? (await this.manager.getLatestFromDumpServer(dumpSource)).url : dumpSource;
      //     localDumpPath = await this.manager.getDumpFromRemoteToFs(remoteDumpUrl);
      // }
      // await this.manager.creation(localScriptPath, localDumpPath);
      // this.logger.info(`successfully created ${s3ProjectId}`);
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        // this.logger.error((error as Error).message);
      }

      container.register(EXIT_CODE, { useValue: exitCode });
      // this.logger.warn(`an error occurred, exiting with code ${exitCode}`);
    }
  };

  return {
    command,
    describe,
    builder,
    handler,
  };
};

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
      .option('s3LuaScriptKey', {
        alias: ['l', 's3-lua-script-key'],
        describe: 'The lua script key in s3',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
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
    const { s3ProjectId, s3LuaScriptKey, dumpSourceType, dumpSource } = argv;
    const scriptKey = join(s3ProjectId, s3LuaScriptKey);

    // TODO: transfer buisness logic to manager
    try {
      const localScriptPath = await this.manager.getScriptFromS3ToFs(scriptKey);

      let localDumpPath = dumpSource;

      if (dumpSourceType !== DumpSourceType.LOCAL_FILE) {
        const remoteDumpUrl =
          dumpSourceType === DumpSourceType.DUMP_SERVER ? (await this.manager.getLatestFromDumpServer(dumpSource)).url : dumpSource;
        localDumpPath = await this.manager.getDumpFromRemoteToFs(remoteDumpUrl);
      }

      await this.manager.creation(localScriptPath, localDumpPath);

      this.logger.info(`successfully created ${s3ProjectId}`);
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
