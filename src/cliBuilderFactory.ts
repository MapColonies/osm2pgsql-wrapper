import yargs from 'yargs/yargs';
import { Argv } from 'yargs';
import { S3Client } from '@aws-sdk/client-s3';
import { FactoryFunction } from 'tsyringe';
import { SERVICES, S3_REGION } from './common/constants';
import { AppendCommand } from './commands/append/append';
import { CreateCommand } from './commands/create/create';

export interface GlobalArguments {
  s3Endpoint: string;
  s3BucketName: string;
  s3KeyId: string;
  s3Acl: string;
}

export const cliBuilderFactory: FactoryFunction<Argv> = (dependencyContainer) => {
  const args = yargs()
    .env()
    .usage('Usage: $0 <command> [options]')
    .demandCommand(1, 'Please provide a command')
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
    .help('h')
    .alias('h', 'help');

  args.middleware((argv) => {
    const { s3Endpoint } = argv;
    const client = new S3Client({
      endpoint: s3Endpoint,
      region: S3_REGION,
      forcePathStyle: true,
    });
    dependencyContainer.register(SERVICES.S3, { useValue: client });
  });

  args.command(dependencyContainer.resolve(CreateCommand));
  args.command(dependencyContainer.resolve(AppendCommand));

  return args;
};
