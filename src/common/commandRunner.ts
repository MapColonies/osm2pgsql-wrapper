import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { PassThrough } from 'stream';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import concatStream from 'concat-stream';
import { SERVICES } from './constants';
import { IConfig, Osm2pgsqlConfig, OsmiumConfig } from './interfaces';
import { Executable } from './types';

interface ExecuteReturn {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const readStream = async (stream: NodeJS.ReadableStream): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    stream.pipe(
      concatStream((result: Buffer) => {
        resolve(result.toString());
      }).on('error', reject)
    );
  });
};

@injectable()
export class CommandRunner {
  private readonly globalCommandArgs: Record<Executable, string[]> = { osm2pgsql: [], osmium: [] };

  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    this.processConfig(config);
  }

  public createProcess(executable: Executable, command: string, commandArgs: string[] = []): ChildProcessWithoutNullStreams {
    const globalArgs = this.globalCommandArgs[executable];
    const args = [command, ...globalArgs, ...commandArgs];

    const prettyArgs = args.join(' ');
    this.logger.debug(`running command: ${executable} ${prettyArgs}`);

    return spawn(executable, args);
  }

  public async run(executable: Executable, command: string, commandArgs: string[] = []): Promise<ExecuteReturn> {
    const childProcess = this.createProcess(executable, command, commandArgs);

    childProcess.stdin.setDefaultEncoding('utf-8');

    const stderrClonedForLogging = childProcess.stderr.pipe(new PassThrough());
    const stderrClonedForResult = childProcess.stderr.pipe(new PassThrough());

    readline.createInterface(stderrClonedForLogging).on('line', (line) => {
      if (line.length > 0) {
        this.logger.info(line);
      }
    });

    const promise = new Promise<ExecuteReturn>((resolve, reject) => {
      childProcess.once('exit', (code) => {
        Promise.all([readStream(stderrClonedForResult), readStream(childProcess.stderr)])
          .then(([stdout, stderr]) => resolve({ exitCode: code, stdout, stderr }))
          .catch(reject);
      });
      childProcess.on('error', reject);
    });
    return promise;
  }

  private processConfig(config: IConfig): void {
    const osm2pgsqlConfig = config.get<Osm2pgsqlConfig>('osm2pgsql');
    const osm2pgsqlArgs = this.globalCommandArgs.osm2pgsql;

    if (osm2pgsqlConfig.slim !== undefined && osm2pgsqlConfig.slim) {
      osm2pgsqlArgs.push('--slim');
    }
    osm2pgsqlArgs.push(`--cache=${osm2pgsqlConfig.cache}`);
    osm2pgsqlArgs.push(`--number-processes=${osm2pgsqlConfig.processes}`);
    osm2pgsqlArgs.push(`--output=${osm2pgsqlConfig.output}`);
    osm2pgsqlArgs.push(`--log-level=${osm2pgsqlConfig.logger.level}`);
    osm2pgsqlArgs.push(`--log-progress=${osm2pgsqlConfig.logger.progress ? 'true' : 'false'}`);

    const osmiumConfig = config.get<OsmiumConfig>('osmium');
    const osmiumArgs = this.globalCommandArgs.osmium;

    if (osmiumConfig.verbose) {
      osmiumArgs.push('--verbose');
    }
    osmiumArgs.push(`${osmiumConfig.progress ? '--progress' : '--no-progress'}`);
  }
}
