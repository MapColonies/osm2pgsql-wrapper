import fsPromises from 'fs/promises';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { StatefulMediator } from '@map-colonies/arstotzka-mediator';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ValidationResponse } from '../../../validation/validator';
import { AppendEntity } from '../../../validation/schemas';
import { ErrorWithExitCode } from '../../../common/errors';
import { uploadTargetsRegistrationMiddlewareFactory } from '../../middlewares';
import { ArstotzkaConfig } from '../../../common/interfaces';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { configCheck, limitCheck, uploadTargetsCheck } from '../../checks';
import { AppendManager } from './appendManager';
import { command, describe, APPEND_MANAGER_FACTORY } from './constants';
import { AppendArguments } from './interfaces';

const DEFAULT_WAIT_TIME_SECONDS = 10;

export const appendCommandFactory: FactoryFunction<CommandModule<GlobalArguments, AppendArguments>> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);

  const builder = (args: Argv<GlobalArguments>): Argv<AppendArguments> => {
    args
      .option('config', {
        alias: 'c',
        describe: 'The job configuration path',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('replicationUrl', { alias: ['r', 'replication-url'], describe: 'The replication url', nargs: 1, type: 'string', demandOption: true })
      .option('forever', { alias: 'f', describe: 'Process diffs in loop forever without stopping', type: 'boolean' })
      .option('waitTimeSeconds', {
        alias: 't',
        describe: 'The amount of time to wait between state checks when the local state is up to date or when error occurs',
        type: 'number',
      })
      .option('s3Acl', {
        alias: ['a', 's3-acl'],
        describe: 'The canned acl policy for uploaded objects',
        choices: ['authenticated-read', 'private', 'public-read', 'public-read-write'],
        default: 'private',
      })
      .option('uploadTargets', {
        alias: ['u', 'upload-targets'],
        type: 'array',
        describe: 'upload expired tiles to the selected sources',
        choices: ['s3', 'queue'],
        string: true,
        default: [] as string[],
        coerce: (targetsString: string) => {
          return targetsString[0] ? targetsString[0].split(',') : [];
        },
      })
      .option('name', {
        alias: ['queue-name'],
        type: 'string',
      })
      .option('minZoom', {
        alias: ['queue-min-zoom'],
        type: 'number',
      })
      .option('maxZoom', {
        alias: ['queue-max-zoom'],
        type: 'number',
      })
      .check(limitCheck(throwIfInvalidResponse))
      .check(configCheck(throwIfInvalidResponse))
      .check(uploadTargetsCheck(throwIfInvalidResponse))
      .middleware(uploadTargetsRegistrationMiddlewareFactory(dependencyContainer));

    return args as Argv<AppendArguments>;
  };

  const handler = async (args: Arguments<AppendArguments>): Promise<void> => {
    const { pguser, pgpassword, awsSecretAccessKey, awsAccessKeyId, pgbossUsername, pgBossPassword, forever, waitTimeSeconds, ...restOfArgs } = args;
    logger.debug({ msg: 'starting wrapper command execution', command, args: restOfArgs });

    const { config, s3ProjectId, replicationUrl, uploadTargets } = args;

    const arstotzkaConfig = dependencyContainer.resolve<ArstotzkaConfig>(SERVICES.ARSTOTZKA);
    let mediator: StatefulMediator | undefined;
    if (arstotzkaConfig.enabled) {
      mediator = new StatefulMediator({ ...arstotzkaConfig.mediator, serviceId: arstotzkaConfig.serviceId, logger });
    }

    const manager = dependencyContainer.resolve<AppendManager>(APPEND_MANAGER_FACTORY);

    try {
      const configContent = await fsPromises.readFile(config, 'utf-8');
      const appendEntities = JSON.parse(configContent) as AppendEntity[];

      logger.info({ msg: 'append configuration', projectId: s3ProjectId, entitiesCount: appendEntities.length, uploadTargets });

      await manager.prepareManager(s3ProjectId, appendEntities, uploadTargets as ExpireTilesUploadTarget[]);

      if (forever === true) {
        await manager.appendForever(replicationUrl, waitTimeSeconds ?? DEFAULT_WAIT_TIME_SECONDS, mediator);
      } else {
        await manager.append(replicationUrl, mediator);
      }

      logger.info({ msg: 'finished executing wrapper command successfully', command, project: s3ProjectId });

      dependencyContainer.register(EXIT_CODE, { useValue: ExitCodes.SUCCESS });
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;

      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      }

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
