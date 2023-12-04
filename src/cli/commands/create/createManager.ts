import { join } from 'path';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR, DEFAULT_DUMP_NAME, PROJECT_CREATION_SEQUENCE_NUMBER, SERVICES } from '../../../common/constants';
import { streamToFs } from '../../../common/util';
import { DumpClient, DumpMetadataResponse } from '../../../httpClient/dumpClient';
import { DumpServerEmptyResponseError } from '../../../common/errors';
import { RemoteResourceManager } from '../../../remoteResource/remoteResourceManager';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { DumpSourceType } from './constants';

interface LocalDump {
  localPath: string;
  sequenceNumber: number;
}

export class CreateManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly dumpClient: DumpClient,
    private readonly osmCommandRunner: OsmCommandRunner,
    private readonly remoteResourceManager: RemoteResourceManager
  ) {}

  public async create(projectId: string, luaScriptKey: string, dump: LocalDump): Promise<void> {
    this.logger.info({ msg: 'creating project', projectId, dump, luaScriptKey });

    const scriptKey = join(projectId, luaScriptKey);

    this.logger.info({ msg: 'getting script from remote to file system', projectId, scriptKey });

    await this.remoteResourceManager.load([{ id: scriptKey, type: 'script' }]);

    const localScriptPath = this.remoteResourceManager.getResource<string>(scriptKey);

    this.logger.info({ msg: 'attempting to osm2pg create', projectId, luaScriptKey });

    await this.osmCommandRunner.create(localScriptPath, dump.localPath);
  }

  public async loadDump(dumpSource: string, dumpSourceType: DumpSourceType): Promise<LocalDump> {
    let path: string;
    let metadata: DumpMetadataResponse;

    switch (dumpSourceType) {
      case DumpSourceType.LOCAL_FILE:
        return { localPath: dumpSource, sequenceNumber: PROJECT_CREATION_SEQUENCE_NUMBER };
      case DumpSourceType.REMOTE_URL:
        path = await this.getDumpFromRemoteToFs(dumpSource);
        return { localPath: path, sequenceNumber: PROJECT_CREATION_SEQUENCE_NUMBER };
      case DumpSourceType.DUMP_SERVER:
        metadata = await this.getLatestFromDumpServer(dumpSource);
        path = await this.getDumpFromRemoteToFs(metadata.url);
        return { localPath: path, sequenceNumber: metadata.sequenceNumber ?? PROJECT_CREATION_SEQUENCE_NUMBER };
    }
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
