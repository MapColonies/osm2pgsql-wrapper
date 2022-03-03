import { Logger } from '@map-colonies/js-logger';
import PgBoss from 'pg-boss';
import { FactoryFunction } from 'tsyringe';
import { OsmCommandRunner } from '../../commandRunner/OsmCommandRunner';
import { SERVICES } from '../../common/constants';
import { IConfig } from '../../common/interfaces';
import { ReplicationClient } from '../../httpClient/replicationClient';
import { PgBossQueueProvider } from '../../queue/pgBossQueueProvider';
import { S3ClientWrapper } from '../../s3Client/s3Client';
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
  const pgBossQueueProv = dependencyContainer.isRegistered(PgBoss) ? dependencyContainer.resolve(PgBossQueueProvider) : undefined;
  return new AppendManager(logger, config, stateTracker, s3Client, replicationClient, osmCommandRunner, configStore, pgBossQueueProv);
};
