import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { Argv } from 'yargs';
import { SERVICES } from './common/constants';
import { AppendCommand } from './commands/append/append';
import { CreateCommand } from './commands/create/create';

export interface GlobalArguments {
  s3EndpointUrl: string;
  s3BucketName: string;
  s3KeyId: string;
  s3Acl: string;
}

@injectable()
export class CliBuilder {
  public args: Argv;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly create: CreateCommand,
    private readonly append: AppendCommand
  ) {
    this.args = yargs();
  }

  public build(): CliBuilder {
    this.args
      .env()
      .usage('Usage: $0 <command> [options]')
      .command(this.create)
      .command(this.append)
      .demandCommand(1, 'Please provide a command')
      .help('h')
      .alias('h', 'help');

    this.registerGlobalOptions();

    return this;
  }

  private registerGlobalOptions(): void {
    this.args
      .option('s3Endpoint', { alias: ['e', 's3-endpoint'], describe: 'The s3 endpoint', nargs: 1, type: 'string', demandOption: true })
      .option('s3BucketName', {
        alias: ['b', 's3-bucket-name'],
        describe: 'The bucket name containing the state and script',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('s3KeyId', {
        alias: ['k', 's3-key-id'],
        describe: 'The unique id for the state and script keys',
        nargs: 1,
        type: 'string',
        demandOption: true,
      })
      .option('s3Acl', { alias: ['a', 's3-acl'], describe: 'The Acl policy for uploaded objects', nargs: 1, type: 'string', default: 'public-read' })
      .option('zx-shell', { alias: 'z', describe: 'The shell used by zx', nargs: 1, default: '/bin/bash' });
  }

  public async run(enteredArgs: string[]): Promise<void> {
    await this.args.parseAsync(hideBin(enteredArgs));
  }
}
