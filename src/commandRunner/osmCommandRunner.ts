import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { Osm2pgsqlError, OsmiumError } from '../common/errors';
import { LogLevel } from '../common/types';
import { IConfig, ILogger, Osm2pgsqlConfig, OsmiumConfig } from '../common/interfaces';
import { spawnChild } from './spawner';

type Executable = 'osm2pgsql' | 'osmium';

@injectable()
export class OsmCommandRunner {
  private readonly globalCommandArgs: Record<Executable, string[]> = { osm2pgsql: [], osmium: [] };

  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(SERVICES.CONFIG) private readonly config: IConfig) {
    this.processConfig(config);
  }

  public async append(args: string[]): Promise<void> {
    const executable: Executable = 'osm2pgsql';
    const command = '--append';
    const globalArgs = this.globalCommandArgs[executable];
    const finalArgs = [...globalArgs, ...args];
    const isVerbose = this.config.get<LogLevel>('osm2pgsql.logger.level') === 'debug';

    await this.commandWrapper(executable, finalArgs, Osm2pgsqlError, command, undefined, isVerbose);
  }

  public async create(stylePath: string, dumpPath: string): Promise<void> {
    const executable: Executable = 'osm2pgsql';
    const command = '--create';
    const globalArgs = this.globalCommandArgs[executable];
    const args = [...globalArgs, `--style=${stylePath}`, dumpPath];
    const isVerbose = this.config.get<LogLevel>('osm2pgsql.logger.level') === 'debug';

    await this.commandWrapper(executable, args, Osm2pgsqlError, command, undefined, isVerbose);
  }

  public async mergeChanges(input: string, output: string): Promise<void> {
    const executable: Executable = 'osmium';
    const command = 'merge-changes';
    const globalArgs = this.globalCommandArgs[executable];
    const args = [...globalArgs, `${input}`, `--output=${output}`, `--overwrite`];
    const isVerbose = this.config.get<boolean>('osmium.verbose');

    await this.commandWrapper(executable, args, OsmiumError, command, undefined, isVerbose);
  }

  private async commandWrapper(
    executable: Executable,
    args: string[],
    error: new (message?: string) => Error = Error,
    command?: string,
    cwd?: string,
    verbose?: boolean
  ): Promise<string> {
    this.logger.info({ msg: 'executing command', executable, command, args, cwd });

    let childLogger: ILogger | undefined;
    if (verbose === true) {
      childLogger = this.logger.child({ executable, command, args }, { level: 'debug' });
    }

    try {
      const { exitCode, stderr, stdout } = await spawnChild(executable, args, command, cwd, undefined, childLogger);

      if (exitCode !== 0) {
        this.logger.error({ msg: 'failure occurred during the execute of command', executable, command, args, executableExitCode: exitCode, stderr });
        throw new error(`an error occurred while running ${executable} with ${command ?? 'undefined'} command, exit code ${exitCode}`);
      }

      return stdout;
    } catch (err) {
      this.logger.error({ msg: 'failure occurred during the execute of command', executable, command, args, err });
      throw new error(`an error occurred while running ${executable} with ${command ?? 'undefined'} command, exit code`);
    }
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
    if (osm2pgsqlConfig.schema !== undefined) {
      osm2pgsqlArgs.push(`--schema=${osm2pgsqlConfig.schema}`);
    }
    if (osm2pgsqlConfig.middleSchema !== undefined) {
      osm2pgsqlArgs.push(`--middle-schema=${osm2pgsqlConfig.middleSchema}`);
    }
    if (osm2pgsqlConfig.logger.sql) {
      osm2pgsqlArgs.push('--log-sql');
    }
    if (osm2pgsqlConfig.logger.sqlData) {
      osm2pgsqlArgs.push('--log-sql-data');
    }

    const osmiumConfig = config.get<OsmiumConfig>('osmium');
    const osmiumArgs = this.globalCommandArgs.osmium;

    if (osmiumConfig.verbose) {
      osmiumArgs.push('--verbose');
    }
    osmiumArgs.push(`${osmiumConfig.progress ? '--progress' : '--no-progress'}`);
    osmiumArgs.push('--simplify');
  }
}
