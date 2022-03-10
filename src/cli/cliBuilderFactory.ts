import yargs from 'yargs/yargs';
import { Argv, CommandModule } from 'yargs';
import { FactoryFunction } from 'tsyringe';
import { CREATE_COMMAND_FACTORY } from './commands/create/constants';
import { APPEND_COMMAND_FACTORY } from './commands/append/constants';
import { s3RegisterationMiddlewareFactory } from './middlewares';

export interface GlobalArguments {
  s3Endpoint: string;
  s3BucketName: string;
  s3ProjectId: string;
}

export const cliBuilderFactory: FactoryFunction<Argv> = (dependencyContainer) => {
  const args = yargs()
    .env()
    .usage('Usage: $0 <command> [options]')
    .demandCommand(1, 'Please provide a command')
    .option('s3Endpoint', { alias: ['e', 's3-endpoint'], describe: 'The s3 endpoint', nargs: 1, type: 'string', demandOption: true })
    .option('s3BucketName', {
      alias: ['b', 's3-bucket-name'],
      describe: 'The bucket name containing the state and the lua script',
      nargs: 1,
      type: 'string',
      demandOption: true,
    })
    .option('s3ProjectId', {
      alias: ['p', 's3-project-id', 'project-id'],
      describe: 'The unique project id used as s3 object prefix for the state and lua scripts',
      nargs: 1,
      type: 'string',
      demandOption: true,
    })
    .help('h')
    .alias('h', 'help');

  args.middleware(s3RegisterationMiddlewareFactory(dependencyContainer));

  args.command(dependencyContainer.resolve<CommandModule>(CREATE_COMMAND_FACTORY));
  args.command(dependencyContainer.resolve<CommandModule>(APPEND_COMMAND_FACTORY));

  return args;
};
