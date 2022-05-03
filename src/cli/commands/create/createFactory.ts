import { Argv, CommandModule, Arguments } from 'yargs';
import { Logger } from '@map-colonies/js-logger';
import { FactoryFunction } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../../common/constants';
import { ErrorWithExitCode } from '../../../common/errors';
import { dumpSourceCheck } from '../../checks';
import { CreateManager } from './createManager';
import { command, describe, CREATE_MANAGER_FACTORY, DumpSourceType } from './constants';

export interface CreateArguments extends GlobalArguments {
  dumpSourceType: DumpSourceType;
  dumpSource: string;
  s3LuaScriptKey: string;
}

export const createCommandFactory: FactoryFunction<CommandModule<GlobalArguments, CreateArguments>> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);

  const builder = (args: Argv<GlobalArguments>): Argv<CreateArguments> => {
    args
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
      .check(dumpSourceCheck());
    return args as Argv<CreateArguments>;
  };

  const handler = async (argv: Arguments<CreateArguments>): Promise<void> => {
    const { s3ProjectId, s3LuaScriptKey, dumpSource, dumpSourceType } = argv;

    try {
      const manager = dependencyContainer.resolve<CreateManager>(CREATE_MANAGER_FACTORY);

      await manager.create(s3ProjectId, s3LuaScriptKey, dumpSource, dumpSourceType);

      logger.info(`finished successfully the creation of ${s3ProjectId}`);
      dependencyContainer.register(EXIT_CODE, { useValue: ExitCodes.SUCCESS });
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        logger.error((error as Error).message);
      }

      dependencyContainer.register(EXIT_CODE, { useValue: exitCode });
      logger.warn(`an error occurred, exiting with code ${exitCode}`);
    }
  };

  return {
    command,
    describe,
    builder,
    handler,
  };
};
