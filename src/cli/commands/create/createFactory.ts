import { Argv, CommandModule, Arguments } from 'yargs';
import { Logger } from '@map-colonies/js-logger';
import { FactoryFunction } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../../common/constants';
import { ErrorWithExitCode } from '../../../common/errors';
import { dumpSourceCheck } from '../../checks';
import { ValidationResponse } from '../../../validation/validator';
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
      .check(dumpSourceCheck(throwIfInvalidResponse));
    return args as Argv<CreateArguments>;
  };

  const handler = async (args: Arguments<CreateArguments>): Promise<void> => {
    const { pguser, pgpassword, awsSecretAccessKey, awsAccessKeyId, ...restOfArgs } = args;
    logger.debug({ msg: 'starting wrapper command execution', command, args: restOfArgs });

    const { s3ProjectId, s3LuaScriptKey, dumpSource, dumpSourceType } = args;

    try {
      const manager = dependencyContainer.resolve<CreateManager>(CREATE_MANAGER_FACTORY);

      await manager.create(s3ProjectId, s3LuaScriptKey, dumpSource, dumpSourceType);

      logger.info({ msg: 'finished wrapper command execution successfully', command, project: s3ProjectId });

      dependencyContainer.register(EXIT_CODE, { useValue: ExitCodes.SUCCESS });
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;

      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      }

      dependencyContainer.register(EXIT_CODE, { useValue: exitCode });
      logger.error({ err: error as Error, msg: 'an error occurred while executing wrapper command', command, exitCode });
    }
  };

  const throwIfInvalidResponse = <T>(validationResponse: ValidationResponse<T>): void => {
    if (!validationResponse.isValid || validationResponse.content === undefined) {
      const { errors } = validationResponse;
      logger.error({ err: errors, msg: 'argument validation failure', command });
      throw new Error(errors);
    }
  };

  return {
    command,
    describe,
    builder,
    handler,
  };
};
