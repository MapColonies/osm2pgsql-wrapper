import { join } from 'path';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_DUMP_NAME, SERVICES } from '../../../common/constants';
import { streamToFs } from '../../../common/util';
import { DumpClient, DumpMetadataResponse } from '../../../httpClient/dumpClient';
import { DumpServerEmptyResponseError } from '../../../common/errors';
import { RemoteResourceManager } from '../../../remoteResource/remoteResourceManager';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { DumpSourceType } from './constants';

export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly dumpClient: DumpClient,
    private readonly osmCommandRunner: OsmCommandRunner,
    private readonly remoteResourceManager: RemoteResourceManager
  ) {}

  public async create(projectId: string, luaScriptKey: string, dumpSource: string, dumpSourceType: DumpSourceType): Promise<void> {
    this.logger.info({ msg: 'creating project', projectId, dumpSourceType, dumpSource, luaScriptKey });

    const scriptKey = join(projectId, luaScriptKey);

    this.logger.info({ msg: 'getting script from remote to file system', projectId, scriptKey });

    await this.remoteResourceManager.load([{ id: scriptKey, type: 'script' }]);

    const localScriptPath = this.remoteResourceManager.getResource<string>(scriptKey);

    let localDumpPath = dumpSource;

    if (dumpSourceType !== DumpSourceType.LOCAL_FILE) {
      const remoteDumpUrl = dumpSourceType === DumpSourceType.DUMP_SERVER ? (await this.getLatestFromDumpServer(dumpSource)).url : dumpSource;

      this.logger.info({ msg: 'getting dump from remote service', url: remoteDumpUrl, projectId });

      localDumpPath = await this.getDumpFromRemoteToFs(remoteDumpUrl);
    }

    this.logger.info({ msg: 'attempting to osm2pg create', projectId, luaScriptKey });

    await this.osmCommandRunner.create([`--style=${localScriptPath}`, localDumpPath]);
  }

  private async getLatestFromDumpServer(dumpServerUrl: string): Promise<DumpMetadataResponse> {
    const dumpServerResponse = await this.dumpClient.getDumpsMetadata(dumpServerUrl, { limit: 1, sort: 'desc' });
    if (dumpServerResponse.data.length === 0) {
      this.logger.error({ msg: 'received empty dumps response from dump-server', dumpServerUrl });
      throw new DumpServerEmptyResponseError(`received empty dumps response from dump-server`);
    }

    return dumpServerResponse.data[0];
  }

  private async getDumpFromRemoteToFs(url: string, name = DEFAULT_DUMP_NAME): Promise<string> {
    const localDumpPath = join(DATA_DIR, name);
    const response = await this.dumpClient.getDump(url);
    await streamToFs(response.data, localDumpPath);
    return localDumpPath;
  }
}
