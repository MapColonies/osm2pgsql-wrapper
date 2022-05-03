import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import { PassThrough } from 'stream';
import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import concatStream from 'concat-stream';
import { SERVICES } from '../common/constants';

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
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {}

  public createProcess(executable: string, command: string, commandArgs: string[] = []): ChildProcessWithoutNullStreams {
    const args = [command, ...commandArgs];

    const prettyArgs = args.join(' ');
    this.logger.debug(`running command: ${executable} ${prettyArgs}`);

    return spawn(executable, args);
  }

  public async run(executable: string, command: string, commandArgs: string[] = []): Promise<ExecuteReturn> {
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
}
