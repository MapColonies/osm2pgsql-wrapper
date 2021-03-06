import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import axios from 'axios';
import { SERVICES, CLI_NAME, CLI_BUILDER, EXIT_CODE, ExitCodes } from './common/constants';
import { tracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { cliBuilderFactory } from './cli/cliBuilderFactory';
import { appendCommandFactory } from './cli/commands/append/appendFactory';
import { APPEND_COMMAND_FACTORY, APPEND_MANAGER_FACTORY } from './cli/commands/append/constants';
import { appendManagerFactory } from './cli/commands/append/appendManagerFactory';
import { ConfigStore } from './common/configStore';
import { CREATE_COMMAND_FACTORY, CREATE_MANAGER_FACTORY } from './cli/commands/create/constants';
import { createManagerFactory } from './cli/commands/create/createManagerFactory';
import { createCommandFactory } from './cli/commands/create/createFactory';
import { ShutdownHandler } from './common/shutdownHandler';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const shutdownHandler = new ShutdownHandler();

  try {
    const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
    const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });

    const configStore = new ConfigStore();

    const httpClientConfig = config.get<object>('httpClient');
    const axiosClient = axios.create(httpClientConfig);

    const tracer = trace.getTracer(CLI_NAME);
    shutdownHandler.addFunction(tracing.stop.bind(tracing));

    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.LOGGER, provider: { useValue: logger } },
      { token: SERVICES.CONFIG, provider: { useValue: config } },
      { token: SERVICES.CONFIG_STORE, provider: { useValue: configStore } },
      { token: CLI_BUILDER, provider: { useFactory: cliBuilderFactory } },
      { token: CREATE_COMMAND_FACTORY, provider: { useFactory: createCommandFactory } },
      { token: CREATE_MANAGER_FACTORY, provider: { useFactory: createManagerFactory } },
      { token: APPEND_COMMAND_FACTORY, provider: { useFactory: appendCommandFactory } },
      { token: APPEND_MANAGER_FACTORY, provider: { useFactory: appendManagerFactory } },
      { token: ShutdownHandler, provider: { useValue: shutdownHandler } },
      { token: SERVICES.TRACER, provider: { useValue: tracer } },
      { token: SERVICES.HTTP_CLIENT, provider: { useValue: axiosClient } },
      { token: EXIT_CODE, provider: { useValue: ExitCodes.GENERAL_ERROR } },
    ];

    const container = registerDependencies(dependencies, options?.override, options?.useChild);
    return container;
  } catch (error) {
    await shutdownHandler.onShutdown();
    throw error;
  }
};
