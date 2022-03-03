import { S3Client } from '@aws-sdk/client-s3';
import PgBoss from 'pg-boss';
import { DependencyContainer } from 'tsyringe';
import { Arguments, MiddlewareFunction } from 'yargs';
import { GlobalArguments } from '../cliBuilderFactory';
import { AppendArguments } from '../commands/append/interfaces';
import { ConfigStore } from '../common/configStore';
import { S3_REGION, SERVICES } from '../common/constants';
import { IConfig } from '../common/interfaces';
import { DbConfig, pgBossFactory } from '../queue/pgBossFactory';

type RegisterOnContainerMiddlewareFactory<T> = (container: DependencyContainer) => MiddlewareFunction<T>;

export const s3RegisterationMiddlewareFactory: RegisterOnContainerMiddlewareFactory<GlobalArguments> = (dependencyContainer) => {
  const middleware = (args: Arguments<GlobalArguments>): void => {
    const { s3Endpoint, s3BucketName } = args;

    const configStore = dependencyContainer.resolve<ConfigStore>(SERVICES.CONFIG_STORE);
    configStore.set('s3', { bucketName: s3BucketName });

    const client = new S3Client({
      endpoint: s3Endpoint,
      region: S3_REGION,
      forcePathStyle: true,
    });

    dependencyContainer.register(SERVICES.S3, { useValue: client });
  };

  return middleware;
};

export const uploadTargetsRegistrationMiddlewareFactory: RegisterOnContainerMiddlewareFactory<AppendArguments> = (dependencyContainer) => {
  const middleware = (args: Arguments<AppendArguments>): void => {
    const { uploadTargets } = args;

    if (uploadTargets.length > 0) {
      const configStore = dependencyContainer.resolve<ConfigStore>(SERVICES.CONFIG_STORE);

      const uploadTargetsSet = new Set(uploadTargets);

      if (uploadTargetsSet.has('queue')) {
        const config = dependencyContainer.resolve<IConfig>(SERVICES.CONFIG);
        const dbConfig = config.get<DbConfig>('db');
        const pgBossInstance = pgBossFactory(dbConfig);
        dependencyContainer.register(PgBoss, { useValue: pgBossInstance });

        const { name, minZoom, maxZoom } = args;
        const queueConfig = { name, minZoom, maxZoom };
        configStore.set('queue', queueConfig);
      }

      if (uploadTargetsSet.has('s3')) {
        const { s3Acl } = args;
        configStore.set('s3.acl', s3Acl);
      }
    }
  };

  return middleware;
};
