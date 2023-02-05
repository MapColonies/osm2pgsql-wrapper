import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { Osm2pgsqlError, OsmiumError } from '../common/errors';
import { IConfig, Osm2pgsqlConfig, OsmiumConfig } from '../common/interfaces';
import { CommandRunner } from './commandRunner';

type Executable = 'osm2pgsql' | 'osmium';

@injectable()
export class OsmCommandRunner {
  private readonly globalCommandArgs: Record<Executable, string[]> = { osm2pgsql: [], osmium: [] };

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) config: IConfig,
    private readonly commandRunner: CommandRunner
  ) {
    this.processConfig(config);
  }

  public async append(args: string[]): Promise<void> {
    const executable: Executable = 'osm2pgsql';
    const command = '--append';

    await this.commandWrapper(executable, command, args, Osm2pgsqlError);
  }

  public async create(args: string[]): Promise<void> {
    const executable: Executable = 'osm2pgsql';
    const command = '--create';

    await this.commandWrapper(executable, command, args, Osm2pgsqlError);
  }

  public async mergeChanges(args: string[]): Promise<void> {
    const executable: Executable = 'osmium';
    const command = 'merge-changes';

    await this.commandWrapper(executable, command, args, OsmiumError);
  }

  private async commandWrapper(executable: Executable, command: string, args: string[], error: new (message?: string) => Error): Promise<void> {
    this.logger.info({ msg: 'executing osm command', executable, command, args });

    const { exitCode } = await this.commandRunner.run(executable, command, [...this.globalCommandArgs[executable], ...args]);

    if (exitCode !== 0) {
      this.logger.error({ msg: 'failure occurred during the execute of osm command', executable, command, args, executableExitCode: exitCode });
      throw new error(`an error occurred while running ${executable} with ${command} command, exit code ${exitCode as number}`);
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
    osm2pgsqlArgs.push(`--middle-schema=${osm2pgsqlConfig.middleSchema}`);

    const osmiumConfig = config.get<OsmiumConfig>('osmium');
    const osmiumArgs = this.globalCommandArgs.osmium;

    if (osmiumConfig.verbose) {
      osmiumArgs.push('--verbose');
    }
    osmiumArgs.push(`${osmiumConfig.progress ? '--progress' : '--no-progress'}`);
    osmiumArgs.push('--simplify');
  }
}
