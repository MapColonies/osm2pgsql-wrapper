import { delay, inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import yargs, { Argv, CommandModule, Arguments } from 'yargs';
import { join } from 'path';
import { CreateManager } from './createManager';
import { existsSync } from 'fs';
import { GlobalArguments } from '../../cliBuilderFactory';
import { isStringEmptyOrUndefined } from '../../common/util';
import { SERVICES } from '../../common/constants';

interface CreateArguments extends GlobalArguments {
  dumpServerEndpoint?: string;
  dumpFilePath?: string;
  s3ScriptKey: string;
}

@injectable()
export class CreateCommand implements CommandModule<{}, CreateArguments> {
  public command = 'create';
  public describe = 'creating stuff';

  public constructor(@inject(delay(() => CreateManager)) private manager: CreateManager, @inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public builder = (yargs: Argv) => {
    yargs
      .option('dumpServerEndpoint', { alias: ['d', 'dump-server-endpoint'], describe: 'The dump-server endpoint', nargs: 1, type: 'string' })
      .option('dumpFilePath', { alias: ['f', 'dump-file-path'], description: 'The local path to a pbf dump file', nargs: 1, type: 'string' })
      .option('s3ScriptKey', { alias: ['s', 's3-script-key'], describe: 'The lua script key', nargs: 1, type: 'string', demandOption: true })
      .conflicts('d', 'f')
      .check((argv) => {
        const { dumpFilePath, dumpServerEndpoint } = argv;
        if (isStringEmptyOrUndefined(dumpFilePath) && isStringEmptyOrUndefined(dumpServerEndpoint)) {
          throw new Error('please provide dump source');
        }

        if (dumpFilePath !== undefined && (dumpFilePath === '' || !existsSync(dumpFilePath))) {
          throw new Error('provided path to pbf file is not valid');
        }

        return true;
      });
    return yargs as yargs.Argv<CreateArguments>;
  };

  public handler = async (argv: Arguments<CreateArguments>): Promise<void> => {
    const { s3BucketName, s3KeyId, s3ScriptKey, dumpFilePath, dumpServerEndpoint } = argv;
    const scriptKey = join(s3KeyId, s3ScriptKey);

    const scriptPath = await this.manager.getScriptFromS3ToFs(s3BucketName, scriptKey);

    if (dumpServerEndpoint) {
      // get dump from dump-server
    }
    await this.manager.creation(scriptPath, dumpFilePath as string);
  };
}
