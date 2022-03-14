import fsPromises from 'fs/promises';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { ValidationResponse } from '../../../validation/validator';
import { AppendEntity } from '../../../validation/schemas';
import { ErrorWithExitCode } from '../../../common/errors';
import { uploadTargetsRegistrationMiddlewareFactory } from '../../middlewares';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { configCheck, limitCheck, uploadTargetsCheck } from '../../checks';
import { AppendManager } from './appendManager';
import { command, describe, APPEND_MANAGER_FACTORY } from './constants';
import { AppendArguments } from './interfaces';

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
      .option('limit', { alias: 'l', describe: 'Limit the number of appends per run', nargs: 1, type: 'number' })
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
          return targetsString[0].split(',');
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
    const { config, s3ProjectId, replicationUrl, limit, uploadTargets } = args;

    try {
      const manager = dependencyContainer.resolve<AppendManager>(APPEND_MANAGER_FACTORY);

      const configContent = await fsPromises.readFile(config, 'utf-8');
      const appendEntities = JSON.parse(configContent) as AppendEntity[];

      await manager.prepareManager(s3ProjectId, appendEntities, uploadTargets as ExpireTilesUploadTarget[], limit);

      await manager.append(replicationUrl);

      logger.info(`finished successfully the append of ${s3ProjectId}`);
      dependencyContainer.register(EXIT_CODE, { useValue: ExitCodes.SUCCESS });
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        logger.error((error as Error).message);
      }

      dependencyContainer.register(EXIT_CODE, { useValue: exitCode });
      logger.warn(`an error occurred, exiting with exit code ${exitCode}`);
    }
  };

  const throwIfInvalidResponse = <T>(validationResponse: ValidationResponse<T>): void => {
    if (!validationResponse.isValid || validationResponse.content === undefined) {
      const { errors } = validationResponse;
      logger.error(`validation failed with the following errors: ${errors as string}`);
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
