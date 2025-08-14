import { getOtelMixin } from '@map-colonies/telemetry';
import { trace } from '@opentelemetry/api';
import { DependencyContainer, instancePerContainerCachingFactory } from 'tsyringe';
import jsLogger from '@map-colonies/js-logger';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import axios from 'axios';
import { Registry } from 'prom-client';
import { SERVICES, CLI_NAME, CLI_BUILDER, EXIT_CODE, ExitCodes, ON_SIGNAL, METRICS_BUCKETS, LIVENESS_PROBE_FACTORY } from './common/constants';
import { getTracing } from './common/tracing';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { cliBuilderFactory } from './cli/cliBuilderFactory';
import { appendCommandFactory } from './cli/commands/append/appendFactory';
import { APPEND_COMMAND_FACTORY, APPEND_MANAGER_FACTORY } from './cli/commands/append/constants';
import { appendManagerFactory } from './cli/commands/append/appendManagerFactory';
import { ConfigStore } from './common/configStore';
import { CREATE_COMMAND_FACTORY, CREATE_MANAGER_FACTORY } from './cli/commands/create/constants';
import { createManagerFactory } from './cli/commands/create/createManagerFactory';
import { createCommandFactory } from './cli/commands/create/createFactory';
import { terminateChildren } from './commandRunner/spawner';
import { livenessProbeFactory } from './common/liveness';
import { ConfigType, getConfig } from './common/config';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const cleanupRegistry = new CleanupRegistry();

  try {
    const configInstance = getConfig();

    const loggerConfig = configInstance.get('telemetry.logger');
    const logger = jsLogger({ ...loggerConfig, mixin: getOtelMixin() });

    const tracer = trace.getTracer(CLI_NAME);

    const metricsRegistry = new Registry();
    configInstance.initializeMetrics(metricsRegistry);

    const arstotzkaConfig = configInstance.get('arstotzka');
    const configStore = new ConfigStore();

    const httpClientConfig = configInstance.get('httpClient');
    const axiosClient = axios.create(httpClientConfig);

    const cleanupRegistryLogger = logger.child({ component: 'cleanupRegistry' });
    cleanupRegistry.on('itemFailed', (id, error, msg) => cleanupRegistryLogger.error({ msg, itemId: id, err: error }));
    cleanupRegistry.on('itemCompleted', (id) => cleanupRegistryLogger.info({ msg: 'itemCompleted', itemId: id }));
    cleanupRegistry.on('finished', (status) => cleanupRegistryLogger.info({ msg: `finished cleanup`, status }));

    if (!cleanupRegistry.hasAlreadyTriggered) {
      cleanupRegistry.register({
        func: async () => {
          return new Promise((resolve) => {
            terminateChildren();
            return resolve(undefined);
          });
        },
        id: 'terminateChildren',
      });

      cleanupRegistry.register({ id: SERVICES.TRACER, func: getTracing().stop.bind(getTracing()) });
    }

    const dependencies: InjectionObject<unknown>[] = [
      { token: SERVICES.LOGGER, provider: { useValue: logger } },
      { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
      { token: SERVICES.CONFIG_STORE, provider: { useValue: configStore } },
      { token: SERVICES.CLEANUP_REGISTRY, provider: { useValue: cleanupRegistry } },
      { token: CLI_BUILDER, provider: { useFactory: cliBuilderFactory } },
      { token: CREATE_COMMAND_FACTORY, provider: { useFactory: createCommandFactory } },
      { token: CREATE_MANAGER_FACTORY, provider: { useFactory: createManagerFactory } },
      { token: APPEND_COMMAND_FACTORY, provider: { useFactory: appendCommandFactory } },
      { token: APPEND_MANAGER_FACTORY, provider: { useFactory: appendManagerFactory } },
      { token: SERVICES.TRACER, provider: { useValue: tracer } },
      {
        token: SERVICES.METRICS_REGISTRY,
        provider: {
          useFactory: instancePerContainerCachingFactory((container) => {
            const config = container.resolve<ConfigType>(SERVICES.CONFIG);
            const isEnabledMetrics = config.get('telemetry.metrics.enabled') as unknown as boolean;

            if (isEnabledMetrics) {
              const metricsRegistry = new Registry();
              configInstance.initializeMetrics(metricsRegistry);
              return metricsRegistry;
            }
          }),
        },
      },
      { token: METRICS_BUCKETS, provider: { useValue: configInstance.get('telemetry.metrics.buckets') } },
      { token: LIVENESS_PROBE_FACTORY, provider: { useFactory: livenessProbeFactory } },
      { token: SERVICES.HTTP_CLIENT, provider: { useValue: axiosClient } },
      { token: SERVICES.ARSTOTZKA, provider: { useValue: arstotzkaConfig } },
      {
        token: ON_SIGNAL,
        provider: {
          useValue: async (): Promise<void> => {
            if (!cleanupRegistry.hasAlreadyTriggered) {
              await cleanupRegistry.trigger();
            }
          },
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
