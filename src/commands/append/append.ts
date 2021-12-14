import { container, delay, inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { Validator } from '../../validation/validator';
import { APPEND_CONFIG_SCHEMA, AppendEntity } from '../../validation/schema';
import { HttpUpstreamResponseError, HttpUpstreamUnavailableError, Osm2pgsqlError, OsmiumError, S3Error } from '../../common/errors';
import { AppendManager as AppendManager } from './appendManager';

export interface AppendArguments extends GlobalArguments {
  config: string;
  replicationUrl: string;
}

@injectable()
export class AppendCommand implements CommandModule<GlobalArguments, AppendArguments> {
  public command = 'append';
  public describe = 'append an osm change file to existing database';

  public constructor(
    @inject(delay(() => AppendManager)) private readonly manager: AppendManager,
    private readonly validator: Validator<AppendEntity[]>,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public builder = (yargs: Argv<GlobalArguments>): Argv<AppendArguments> => {
    yargs
      .option('config', {
        alias: 'c',
        describe: 'The job configuration path',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('replicationUrl', { alias: ['r', 'replication-url'], describe: 'The replication url', nargs: 1, type: 'string', demandOption: true })
      .check(async (argv) => {
        const { config, s3KeyId } = argv;
        const validationResponse = await this.validator.validate(config, APPEND_CONFIG_SCHEMA);

        if (!validationResponse.isValid) {
          const { errors } = validationResponse;
          this.logger.error(`validation failed for ${config} with the following errors: ${errors as string}`);
          throw Error(errors);
        }

        await this.manager.prepareManager(s3KeyId, validationResponse.content as AppendEntity[]);
        return true;
      });

    return yargs as Argv<AppendArguments>;
  };

  public handler = async (argv: Arguments<AppendArguments>): Promise<void> => {
    const { s3BucketName, replicationUrl, s3Acl } = argv;
    try {
      await this.manager.getStartSequenceNumber(s3BucketName);

      await this.manager.getEndSequenceNumber(replicationUrl);

      if (this.manager.isUpToDate()) {
        this.logger.info(`state is up to date, there is nothing to append.`);
        return;
      }

      await this.manager.getScripts(s3BucketName);
      // while (!this.manager.isUpToDate()) {
      await this.manager.appendReplications(replicationUrl, s3BucketName, s3Acl);
      // }
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof S3Error) {
        exitCode = ExitCodes.S3_ERROR;
      } else if (error instanceof HttpUpstreamUnavailableError) {
        exitCode = ExitCodes.REMOTE_SERVICE_UNAVAILABLE;
      } else if (error instanceof HttpUpstreamResponseError) {
        exitCode = ExitCodes.REMOTE_SERVICE_RESPONSE_ERROR;
      } else if (error instanceof Osm2pgsqlError) {
        exitCode = ExitCodes.OSM2PGSQL_ERROR;
      } else if (error instanceof OsmiumError) {
        exitCode = ExitCodes.OSMIUM_ERROR;
      }
      container.register(EXIT_CODE, { useValue: exitCode });
    }
  };
}
