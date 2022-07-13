import { join } from 'path';
import fsPromises from 'fs/promises';
import { Feature, Geometry } from '@turf/turf';
import geojsonValidator from '@turf/boolean-valid';
import { Logger } from '@map-colonies/js-logger';
import { DATA_DIR } from '../common/constants';
import { createDirectory, getFileDirectory } from '../common/util';
import { RemoteResource } from '../common/interfaces';
import { InvalidGeometryError, RemoteResourceNotFound } from '../common/errors';
import { ajvWrapper } from '../validation/validator';
import { BBOX_SCHEMA } from '../validation/schemas';
import { getFilterByBboxFunc, getFilterByGeojsonFunc } from '../cli/commands/append/expireTilesFilters';
import { IResourceProvider } from './resourceProvider';

type FetchedRemoteResource = RemoteResource & {
  content: string;
  processedContent?: unknown;
};

export class RemoteResourceManager {
  private readonly resourceMap: Map<string, FetchedRemoteResource> = new Map();

  public constructor(private readonly logger: Logger, private readonly provider: IResourceProvider) {}

  public async load(resources: RemoteResource[]): Promise<void> {
    await this.getResourcesFromRemote(resources);
    await this.processResources();
  }

  public getResource<T>(id: string): T {
    const resource = this.resourceMap.get(id);
    if (!resource) {
      throw new Error(`resource with id: ${id} not found`);
    }

    return resource.processedContent as T;
  }

  private async getResourceFromRemote(id: string): Promise<string> {
    this.logger.debug({ msg: 'getting resource from remote resource provider', id });

    return this.provider.getResource(id);
  }

  private async getResourcesFromRemote(resources: RemoteResource[]): Promise<void> {
    const uniqueResources = [...new Set(resources)];
    try {
      await Promise.all(
        uniqueResources.map(async (uniqueResource) => {
          const content = await this.getResourceFromRemote(uniqueResource.id);
          this.resourceMap.set(uniqueResource.id, { ...uniqueResource, content });
        })
      );
    } catch (err) {
      throw new RemoteResourceNotFound(`remote resource not found`);
    }
  }

  private async processResources(): Promise<void> {
    this.logger.debug({ msg: 'processing resources', count: this.resourceMap.size });

    for await (const [id, resource] of this.resourceMap) {
      if (resource.type === 'script') {
        const localScriptPath = join(DATA_DIR, id);
        await createDirectory(getFileDirectory(localScriptPath));
        await fsPromises.writeFile(localScriptPath, resource.content);

        resource.processedContent = localScriptPath;
        continue;
      }

      const geojson = JSON.parse(resource.content) as Feature | Geometry;
      const isValidGeojson = geojsonValidator(geojson);
      if (isValidGeojson) {
        resource.processedContent = getFilterByGeojsonFunc(geojson);
        continue;
      }

      const bbox = JSON.parse(resource.content) as unknown;
      const res = ajvWrapper(bbox, BBOX_SCHEMA);
      if (res.isValid) {
        resource.processedContent = getFilterByBboxFunc(res.content as number[]);
        continue;
      }

      this.logger.error({ msg: 'invalid geometry, not a valid geojson or bbox', err: res.errors, id });
      throw new InvalidGeometryError(`geometry with id: ${id} is invalid`);
    }
  }
}
