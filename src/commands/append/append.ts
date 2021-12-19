import { container, delay, inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { ExitCodes, EXIT_CODE, SERVICES } from '../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { Validator } from '../../validation/validator';
import { APPEND_CONFIG_SCHEMA, AppendEntity } from '../../validation/schema';
import { ErrorWithExitCode } from '../../common/errors';
import { AppendManager as AppendManager } from './appendManager';

let appendEntities: AppendEntity[];
let remainingAppends: number | undefined;

export interface AppendArguments extends GlobalArguments {
  config: string;
  replicationUrl: string;
  limit?: number;
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
      .option('limit', { alias: 'l', describe: 'Limit the number of appends per run', nargs: 1, type: 'number' })
      .check(async (argv) => {
        const { config } = argv;
        const validationResponse = await this.validator.validate(config, APPEND_CONFIG_SCHEMA);

        if (!validationResponse.isValid || validationResponse.content === undefined) {
          const { errors } = validationResponse;
          this.logger.error(`validation failed for ${config} with the following errors: ${errors as string}`);
          throw Error(errors);
        }

        appendEntities = validationResponse.content;

        return true;
      });

    return yargs as Argv<AppendArguments>;
  };

  public handler = async (argv: Arguments<AppendArguments>): Promise<void> => {
    const { projectId, s3BucketName, replicationUrl, s3Acl, limit } = argv;

    remainingAppends = limit;

    try {
      await this.manager.prepareManager(projectId, appendEntities);

      await this.manager.getStartSequenceNumber(s3BucketName);

      await this.manager.getEndSequenceNumber(replicationUrl);

      if (this.manager.isUpToDate()) {
        this.logger.info(`state is up to date, there is nothing to append`);
        return;
      }

      await this.manager.getScriptsFromS3ToFs(s3BucketName);

      while (!this.manager.isUpToDate()) {
        if (remainingAppends !== undefined && remainingAppends === 0) {
          this.logger.info(`append limitation of ${limit as number} has reached`);
          break;
        }

        await this.manager.appendReplications(replicationUrl, s3BucketName, s3Acl);

        if (remainingAppends !== undefined) {
          this.logger.info(`append number ${(limit as number) - remainingAppends + 1} out of ${limit as number} has finished`);
          remainingAppends--;
        }
      }

      this.logger.info(`successfully appended ${projectId} from ${this.manager.start} to ${this.manager.current - 1}`);
    } catch (error) {
      let exitCode = ExitCodes.GENERAL_ERROR;
      if (error instanceof ErrorWithExitCode) {
        exitCode = error.exitCode;
      } else {
        this.logger.error((error as Error).message);
      }

      container.register(EXIT_CODE, { useValue: exitCode });
      this.logger.warn(`an error occurred, exiting with exit code ${exitCode}`);
    }
  };
}
