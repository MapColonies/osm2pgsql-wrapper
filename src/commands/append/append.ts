import { delay, inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import yargs, { Arguments, Argv, CommandModule } from 'yargs';
import { AppendManager as AppendManager } from './appendManager';
import { SERVICES, STATE_FILE } from '../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { Validator } from '../../validation/validator';
import { AppendEntity } from '../../validation/schema';

interface AppendArguments extends GlobalArguments {
  config: string;
  replicationUrl: string;
}

@injectable()
export class AppendCommand implements CommandModule<{}, AppendArguments> {
  public command = 'append';
  public describe = 'appending stuff';

  public constructor(
    // private readonly manager: AppendManager,
    @inject(delay(() => AppendManager)) private manager: AppendManager,
    private readonly validator: Validator<AppendEntity[]>,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public builder = (yargs: Argv) => {
    yargs
      .option('config', {
        alias: 'c',
        describe: 'The job configuration path',
        default: '/tmp/config-example.json',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('replicationUrl', { alias: ['r', 'replication-url'], describe: 'The replication url', nargs: 1, type: 'string', demandOption: true })
      .check(async (argv) => {
        const { config } = argv;
        const validationResponse = await this.validator.validate(config);
        if (!validationResponse.isValid) {
          const { errors } = validationResponse;
          this.logger.error(`validation failed for ${config} with the following errors: ${errors}`);
          throw Error(errors);
        }
        this.manager.setEntities(validationResponse.content as AppendEntity[]);
        return true;
      });
    return yargs as yargs.Argv<AppendArguments>;
  };

  public handler = async (argv: Arguments<AppendArguments>): Promise<void> => {
    const { s3BucketName, s3KeyId, s3ScriptKey, replicationUrl } = argv;
    await this.manager.getStartSequenceNumber(s3BucketName, `${s3KeyId}/${STATE_FILE}`);

    await this.manager.getEndSequenceNumber(replicationUrl);

    if (this.manager.isUpToDate()) {
      this.logger.info(`state is up to date, there is nothing to append.`);
      return;
    }

    await this.manager.getScripts(s3BucketName, s3KeyId);
    await this.manager.job(replicationUrl);
    this.logger.info(replicationUrl);
  };
}
