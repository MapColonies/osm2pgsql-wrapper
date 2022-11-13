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
import { DumpSourceArgs } from './createFactory';

export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly dumpClient: DumpClient,
    private readonly osmCommandRunner: OsmCommandRunner,
    private readonly remoteResourceManager: RemoteResourceManager
  ) {}

  public async create(projectId: string, luaScriptKey: string, dumpSourceArgs: DumpSourceArgs): Promise<void> {
    this.logger.info({ msg: 'creating project', projectId, dumpSourceArgs, luaScriptKey });

    const scriptKey = join(projectId, luaScriptKey);

    this.logger.info({ msg: 'getting script from remote to file system', projectId, scriptKey });

    await this.remoteResourceManager.load([{ id: scriptKey, type: 'script' }]);

    const localScriptPath = this.remoteResourceManager.getResource<string>(scriptKey);

    const localDumpPath = await this.getDump(dumpSourceArgs);

    this.logger.info({ msg: 'attempting to osm2pg create', projectId, luaScriptKey });

    await this.osmCommandRunner.create([`--style=${localScriptPath}`, localDumpPath]);
  }

  private async getDump(dumpSourceArgs: DumpSourceArgs): Promise<string> {
    const { dumpSourceType, dumpSource } = dumpSourceArgs;
    switch (dumpSourceType) {
      case DumpSourceType.LOCAL_FILE:
        return dumpSource;
      case DumpSourceType.REMOTE_URL:
        return this.getDumpFromRemoteToFs(dumpSource);
      case DumpSourceType.DUMP_SERVER:
        return this.getDumpFromRemoteToFs((await this.getLatestFromDumpServer(dumpSourceArgs)).url);
    }
  }

  private async getLatestFromDumpServer(dumpSourceArgs: DumpSourceArgs): Promise<DumpMetadataResponse> {
    const { dumpSource, dumpServerHeaders } = dumpSourceArgs;
    const dumpServerResponse = await this.dumpClient.getDumpsMetadata(dumpSource, { limit: 1, sort: 'desc' }, dumpServerHeaders);

    if (dumpServerResponse.data.length === 0) {
      this.logger.error({ msg: 'received empty dumps response from dump-server', dumpSource });
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
