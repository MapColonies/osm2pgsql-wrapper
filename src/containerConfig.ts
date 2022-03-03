import config from 'config';
import { logMethod } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import axios from 'axios';
import { ON_SIGNAL, SERVICES, CLI_NAME, CLI_BUILDER, EXIT_CODE, ExitCodes } from './common/constants';
import { tracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { cliBuilderFactory } from './cliBuilderFactory';
import { appendCommandFactory } from './commands/append/appendFactory';
import { createCommandFactory, CREATE_COMMAND_FACTORY } from './commands/create/createFactory';
import { APPEND_COMMAND_FACTORY, APPEND_MANAGER_FACTORY } from './commands/append/constants';
import { appendManagerFactory } from './commands/append/appendManagerFactory';
import { ConfigStore } from './common/configStore';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

// TODO: shutdownHandlers

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  // @ts-expect-error the signature is wrong
  const logger = jsLogger({ ...loggerConfig, hooks: { logMethod } });

  // TODO: make a factory
  const axiosClient = axios.create({ timeout: config.get('httpClient.timeout') });

  tracing.start();
  const tracer = trace.getTracer(CLI_NAME);

  const configStore = new ConfigStore();

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG_STORE, provider: { useValue: configStore } },
    { token: CLI_BUILDER, provider: { useFactory: cliBuilderFactory } },
    { token: CREATE_COMMAND_FACTORY, provider: { useFactory: createCommandFactory } },
    { token: APPEND_COMMAND_FACTORY, provider: { useFactory: appendCommandFactory } },
    { token: APPEND_MANAGER_FACTORY, provider: { useFactory: appendManagerFactory } },
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.HTTP_CLIENT, provider: { useValue: axiosClient } },
    {
      token: ON_SIGNAL,
      provider: {
        useValue: async (): Promise<void> => {
          await Promise.all([tracing.stop()]);
        },
      },
    },
    { token: EXIT_CODE, provider: { useValue: ExitCodes.SUCCESS } },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
