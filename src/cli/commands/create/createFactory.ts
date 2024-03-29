import { Argv, CommandModule, Arguments } from 'yargs';
import { Logger } from '@map-colonies/js-logger';
import { FactoryFunction } from 'tsyringe';
import { StatefulMediator } from '@map-colonies/arstotzka-mediator';
import { ActionStatus } from '@map-colonies/arstotzka-common';
import { ArstotzkaConfig } from '../../../common/interfaces';
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
  stateOverride?: number;
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
      .option('stateOverride', {
        alias: ['o', 'state-override'],
        description: 'Creation dump state to be set',
        nargs: 1,
        type: 'number',
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

    const { s3ProjectId, s3LuaScriptKey, dumpSource, dumpSourceType, stateOverride } = args;

    const arstotzkaConfig = dependencyContainer.resolve<ArstotzkaConfig>(SERVICES.ARSTOTZKA);
    let mediator: StatefulMediator | undefined;
    if (arstotzkaConfig.enabled) {
      mediator = new StatefulMediator({ ...arstotzkaConfig.mediator, serviceId: arstotzkaConfig.serviceId, logger });
    }

    const manager = dependencyContainer.resolve<CreateManager>(CREATE_MANAGER_FACTORY);

    try {
      await mediator?.reserveAccess();

      const localDump = await manager.loadDump(dumpSource, dumpSourceType, stateOverride);

      await mediator?.createAction({
        state: localDump.sequenceNumber,
        metadata: { command: 'create', s3ProjectId, s3LuaScriptKey, dumpSourceType, dumpSource },
      });

      await mediator?.removeLock();

      await manager.create(s3ProjectId, s3LuaScriptKey, localDump);

      await mediator?.updateAction({ status: ActionStatus.COMPLETED });

      logger.info({ msg: 'finished wrapper command execution successfully', command, project: s3ProjectId });

      dependencyContainer.register(EXIT_CODE, { useValue: ExitCodes.SUCCESS });
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;

      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      }

      await mediator?.updateAction({ status: ActionStatus.FAILED, metadata: { error } });

      dependencyContainer.register(EXIT_CODE, { useValue: exitCode });
      logger.error({ err: error as Error, msg: 'an error occurred while executing wrapper command', command, exitCode });

      throw error;
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
