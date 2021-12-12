import { delay, inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Arguments, Argv, CommandModule } from 'yargs';
import { SERVICES } from '../../common/constants';
import { GlobalArguments } from '../../cliBuilderFactory';
import { Validator } from '../../validation/validator';
import { APPEND_CONFIG_SCHEMA, AppendEntity } from '../../validation/schema';
import { AppendManager as AppendManager } from './appendManager';

export interface AppendArguments extends GlobalArguments {
  config: string;
  replicationUrl: string;
}

@injectable()
export class AppendCommand implements CommandModule<GlobalArguments, AppendArguments> {
  public command = 'append';
  public describe = 'appending stuff';

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
    await this.manager.getStartSequenceNumber(s3BucketName);

    await this.manager.getEndSequenceNumber(replicationUrl);

    if (this.manager.isUpToDate()) {
      this.logger.info(`state is up to date, there is nothing to append.`);
      return;
    }

    await this.manager.getScripts(s3BucketName);
    await this.manager.appendReplications(replicationUrl, s3BucketName, s3Acl);
  };
}
