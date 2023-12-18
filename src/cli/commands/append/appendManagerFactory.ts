import { Logger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import { FactoryFunction } from 'tsyringe';
import { OsmCommandRunner } from '../../../commandRunner/osmCommandRunner';
import { SERVICES, METRICS_BUCKETS } from '../../../common/constants';
import { IConfig } from '../../../common/interfaces';
import { RemoteResourceManager } from '../../../remoteResource/remoteResourceManager';
import { S3RemoteResourceProvider } from '../../../remoteResource/s3ResourceProvider';
import { ReplicationClient } from '../../../httpClient/replicationClient';
import { QUEUE_PROVIDER_SYMBOL } from '../../../queue/constants';
import { QueueProvider } from '../../../queue/queueProvider';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { AppendManager } from './appendManager';
import { StateTracker } from './stateTracker';

export const appendManagerFactory: FactoryFunction<AppendManager> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);
  const config = dependencyContainer.resolve<IConfig>(SERVICES.CONFIG);
  const stateTracker = dependencyContainer.resolve(StateTracker);
  const s3Client = dependencyContainer.resolve(S3ClientWrapper);
  const replicationClient = dependencyContainer.resolve(ReplicationClient);
  const osmCommandRunner = dependencyContainer.resolve(OsmCommandRunner);
  const configStore = dependencyContainer.resolve<IConfig>(SERVICES.CONFIG_STORE);
  const remoteResourceManager = new RemoteResourceManager(logger, new S3RemoteResourceProvider(s3Client));
  const queueProv = dependencyContainer.isRegistered(QUEUE_PROVIDER_SYMBOL)
    ? dependencyContainer.resolve<QueueProvider>(QUEUE_PROVIDER_SYMBOL)
    : undefined;
  const registry = dependencyContainer.resolve<Registry>(SERVICES.METRICS_REGISTRY);
  const metricsBuckets = dependencyContainer.resolve<number[]>(METRICS_BUCKETS);

  return new AppendManager(
    logger,
    config,
    stateTracker,
    s3Client,
    replicationClient,
    osmCommandRunner,
    configStore,
    remoteResourceManager,
    queueProv,
    registry,
    metricsBuckets
  );
};
