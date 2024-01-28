import { Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { FactoryFunction } from 'tsyringe';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { METRICS_BUCKETS, SERVICES } from '../../../common/constants';
import { DumpClient } from '../../../httpClient/dumpClient';
import { RemoteResourceManager } from '../../../remoteResource/remoteResourceManager';
import { S3RemoteResourceProvider } from '../../../remoteResource/s3ResourceProvider';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { CreateManager } from './createManager';

export const createManagerFactory: FactoryFunction<CreateManager> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);
  const dumpClient = dependencyContainer.resolve(DumpClient);
  const osmCommandRunner = dependencyContainer.resolve(OsmCommandRunner);
  const s3Client = dependencyContainer.resolve(S3ClientWrapper);
  const remoteResourceManager = new RemoteResourceManager(logger, new S3RemoteResourceProvider(s3Client));
  const registry = dependencyContainer.resolve<Registry>(SERVICES.METRICS_REGISTRY);
  const metricsBuckets = dependencyContainer.resolve<number[]>(METRICS_BUCKETS);
  return new CreateManager(logger, dumpClient, osmCommandRunner, remoteResourceManager, registry, metricsBuckets);
};
