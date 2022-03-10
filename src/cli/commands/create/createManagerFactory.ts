import { Logger } from '@map-colonies/js-logger';
import { FactoryFunction } from 'tsyringe';
import { OsmCommandRunner } from '../../../commandRunner/OsmCommandRunner';
import { SERVICES } from '../../../common/constants';
import { DumpClient } from '../../../httpClient/dumpClient';
import { S3ClientWrapper } from '../../../s3Client/s3Client';
import { CreateManager } from './createManager';

export const createManagerFactory: FactoryFunction<CreateManager> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);
  const s3Client = dependencyContainer.resolve(S3ClientWrapper);
  const dumpClient = dependencyContainer.resolve(DumpClient);
  const osmCommandRunner = dependencyContainer.resolve(OsmCommandRunner);
  return new CreateManager(logger, s3Client, dumpClient, osmCommandRunner);
};
