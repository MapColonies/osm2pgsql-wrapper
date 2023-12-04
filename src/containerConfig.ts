import config from 'config';
import { getOtelMixin } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import { DependencyContainer } from 'tsyringe';
import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import axios from 'axios';
import { SERVICES, CLI_NAME, CLI_BUILDER, EXIT_CODE, ExitCodes, ON_SIGNAL } from './common/constants';
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
import { ArstotzkaConfig } from './common/interfaces';
import { terminateChildren } from './commandRunner/spawner';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
    const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });

    const arstotzkaConfig = config.get<ArstotzkaConfig>('arstotzka');
    const configStore = new ConfigStore();

    const httpClientConfig = config.get<object>('httpClient');
    const axiosClient = axios.create(httpClientConfig);

    const cleanupRegistryLogger = logger.child({ component: 'cleanupRegistry' });
    cleanupRegistry.on('itemFailed', (id, error, msg) => cleanupRegistryLogger.error({ msg, itemId: id, err: error }));
    cleanupRegistry.on('itemCompleted', (id) => cleanupRegistryLogger.info({ msg: 'itemCompleted', itemId: id }));
    cleanupRegistry.on('finished', (status) => cleanupRegistryLogger.info({ msg: `finished cleanup`, status }));

    cleanupRegistry.register({
      func: async () => {
        return new Promise((resolve) => {
          terminateChildren();
          return resolve(undefined);
        });
      },
      id: 'terminateChildren',
    });
    cleanupRegistry.register({ func: tracing.stop.bind(tracing), id: SERVICES.TRACER.toString() });

    const tracer = trace.getTracer(CLI_NAME);

    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.LOGGER, provider: { useValue: logger } },
      { token: SERVICES.CONFIG, provider: { useValue: config } },
      { token: SERVICES.CONFIG_STORE, provider: { useValue: configStore } },
      { token: SERVICES.CLEANUP_REGISTRY, provider: { useValue: cleanupRegistry } },
      { token: CLI_BUILDER, provider: { useFactory: cliBuilderFactory } },
      { token: CREATE_COMMAND_FACTORY, provider: { useFactory: createCommandFactory } },
      { token: CREATE_MANAGER_FACTORY, provider: { useFactory: createManagerFactory } },
      { token: APPEND_COMMAND_FACTORY, provider: { useFactory: appendCommandFactory } },
      { token: APPEND_MANAGER_FACTORY, provider: { useFactory: appendManagerFactory } },
      { token: SERVICES.TRACER, provider: { useValue: tracer } },
      { token: SERVICES.HTTP_CLIENT, provider: { useValue: axiosClient } },
      { token: SERVICES.ARSTOTZKA, provider: { useValue: arstotzkaConfig } },
      {
        token: ON_SIGNAL,
        provider: {
          useValue: cleanupRegistry.trigger.bind(cleanupRegistry),
        },
      },
      { token: EXIT_CODE, provider: { useValue: ExitCodes.GENERAL_ERROR } },
    ];

    const container = registerDependencies(dependencies, options?.override, options?.useChild);
    return container;
  } catch (error) {
    await cleanupRegistry.trigger();
    throw error;
  }
};
