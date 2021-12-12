import { join } from 'path';
import { existsSync } from 'fs';
import { Argv, CommandModule, Arguments } from 'yargs';
import { Logger } from '@map-colonies/js-logger';
import { delay, inject, injectable } from 'tsyringe';
import { GlobalArguments } from '../../cliBuilderFactory';
import { isStringEmptyOrUndefined } from '../../common/util';
import { SERVICES } from '../../common/constants';
import { CreateManager } from './createManager';

export interface CreateArguments extends GlobalArguments {
  dumpServerUrl?: string;
  dumpFilePath?: string;
  s3ScriptKey: string;
}

@injectable()
export class CreateCommand implements CommandModule<GlobalArguments, CreateArguments> {
  public command = 'create';
  public describe = 'creating stuff';

  public constructor(
    @inject(delay(() => CreateManager)) private readonly manager: CreateManager,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}

  public builder = (yargs: Argv<GlobalArguments>): Argv<CreateArguments> => {
    yargs
      .option('dumpServerUrl', { alias: ['d', 'dump-server-endpoint'], describe: 'The dump-server endpoint', nargs: 1, type: 'string' })
      .option('dumpFilePath', { alias: ['f', 'dump-file-path'], description: 'The local path to a pbf dump file', nargs: 1, type: 'string' })
      .option('s3ScriptKey', { alias: ['s', 's3-script-key'], describe: 'The lua script key', nargs: 1, type: 'string', demandOption: true })
      .conflicts('dumpServerUrl', 'dumpFilePath')
      .check((argv) => {
        const { dumpFilePath, dumpServerUrl } = argv;
        if (isStringEmptyOrUndefined(dumpFilePath) && isStringEmptyOrUndefined(dumpServerUrl)) {
          throw new Error('please provide dump source');
        }

        if (dumpFilePath !== undefined && (dumpFilePath === '' || !existsSync(dumpFilePath))) {
          throw new Error('provided path to pbf file is not valid');
        }

        return true;
      });
    return yargs as Argv<CreateArguments>;
  };

  public handler = async (argv: Arguments<CreateArguments>): Promise<void> => {
    const { s3BucketName, s3KeyId, s3ScriptKey, dumpFilePath, dumpServerUrl } = argv;
    const scriptKey = join(s3KeyId, s3ScriptKey);

    const scriptPath = await this.manager.getScriptFromS3ToFs(s3BucketName, scriptKey);

    let creationDumpFile = dumpFilePath;
    if (dumpServerUrl !== undefined) {
      creationDumpFile = await this.manager.getFromDumpServerToFs(dumpServerUrl);
    }
    await this.manager.creation(scriptPath, creationDumpFile as string);
  };
}
