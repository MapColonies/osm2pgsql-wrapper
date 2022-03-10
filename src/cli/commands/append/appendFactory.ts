import fsPromises from 'fs/promises';
import { container, FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { ExitCodes, EXIT_CODE, NOT_FOUND_INDEX, SERVICES } from '../../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { validateBySchema, ValidationResponse } from '../../../validation/validator';
import { APPEND_CONFIG_SCHEMA, AppendEntity, QUEUE_SETTINGS_SCHEMA, LIMIT_SCHEMA, Limit } from '../../../validation/schemas';
import { ErrorWithExitCode } from '../../../common/errors';
import { uploadTargetsRegistrationMiddlewareFactory } from '../../middlewares';
import { ExpireTilesUploadTarget } from '../../../common/types';
import { AppendManager } from './appendManager';
import { command, describe, APPEND_MANAGER_FACTORY } from './constants';
import { AppendArguments, QueueSettings } from './interfaces';

let appendEntities: AppendEntity[];

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
      .check(async (argv) => {
        const { limit, config, uploadTargets } = argv;
        let validationResponse: ValidationResponse<unknown>;

        validationResponse = validateBySchema<Limit>({ limit }, LIMIT_SCHEMA);
        throwIfInvalidResponse(validationResponse);

        const configContent = await fsPromises.readFile(config, 'utf-8');
        const configContentAsJson: unknown = JSON.parse(configContent);
        validationResponse = validateBySchema<AppendEntity[]>(configContentAsJson, APPEND_CONFIG_SCHEMA);
        throwIfInvalidResponse(validationResponse);

        appendEntities = validationResponse.content as AppendEntity[];

        if (uploadTargets.indexOf('queue') !== NOT_FOUND_INDEX) {
          const { name, minZoom, maxZoom } = argv;
          const request: QueueSettings = {
            name: name as string,
            minZoom: minZoom as number,
            maxZoom: maxZoom as number,
          };
          validationResponse = validateBySchema<QueueSettings>(request, QUEUE_SETTINGS_SCHEMA);
          throwIfInvalidResponse(validationResponse);
        }

        return true;
      })
      .middleware(uploadTargetsRegistrationMiddlewareFactory(dependencyContainer));

    return args as Argv<AppendArguments>;
  };

  const handler = async (args: Arguments<AppendArguments>): Promise<void> => {
    const { s3ProjectId, replicationUrl, limit, uploadTargets } = args;

    try {
      const manager = dependencyContainer.resolve<AppendManager>(APPEND_MANAGER_FACTORY);

      await manager.prepareManager(s3ProjectId, appendEntities, uploadTargets as ExpireTilesUploadTarget[], limit);

      await manager.append(replicationUrl);

      logger.info(`finished successfully the append of ${s3ProjectId}`);
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        logger.error((error as Error).message);
      }

      container.register(EXIT_CODE, { useValue: exitCode });
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
