import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import axios from 'axios';
import { ON_SIGNAL, SERVICES, CLI_NAME } from './common/constants';
import { tracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { IS3 } from './common/interfaces';
import { S3Client } from '@aws-sdk/client-s3';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, hooks: { logMethod } });

  const s3Config = config.get<IS3>('s3');

  const s3Client = new S3Client({
    ...s3Config,
    forcePathStyle: true,
  });

  const axiosClient = axios.create({ timeout: config.get('httpClient.timeout') });

  tracing.start();
  const tracer = trace.getTracer(CLI_NAME);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.S3, provider: { useValue: s3Client } },
    { token: SERVICES.HTTP_CLIENT, provider: { useValue: axiosClient } },
    {
      token: ON_SIGNAL,
      provider: {
        useValue: async (): Promise<void> => {
          console.log('shutting down');
          await Promise.all([tracing.stop()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
