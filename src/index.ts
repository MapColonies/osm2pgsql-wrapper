/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import './common/tracing';
import { createServer } from 'node:http';
import express from 'express';
import { Logger } from '@map-colonies/js-logger';
import { metricsMiddleware } from '@map-colonies/telemetry';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { hideBin } from 'yargs/helpers';
import { DependencyContainer } from 'tsyringe';
import { Registry } from 'prom-client';
import { DEFAULT_PORT, ExitCodes, EXIT_CODE, LIVENESS_PROBE_FACTORY, ON_SIGNAL, SERVICES } from './common/constants';
import { getCli } from './cli/cli';
import { IConfig, IServerConfig } from './common/interfaces';
import { LivenessFactory } from './common/liveness';

let depContainer: DependencyContainer | undefined;

const exitProcess = (): void => {
  const exitCode = depContainer?.isRegistered(EXIT_CODE) === true ? depContainer.resolve<number>(EXIT_CODE) : ExitCodes.GENERAL_ERROR;
  process.exit(exitCode);
};

const shutDownFn = async (): Promise<void> => {
  if (depContainer?.isRegistered(ON_SIGNAL) === true) {
    const onSignalFn: () => Promise<void> = depContainer.resolve(ON_SIGNAL);
    return onSignalFn();
  }
};

void getCli()
  .then(async ([container, cli]) => {
    depContainer = container;

    const config = container.resolve<IConfig>(SERVICES.CONFIG);
    const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
    const livenessFactory = container.resolve<LivenessFactory>(LIVENESS_PROBE_FACTORY);
    const registry = container.resolve<Registry>(SERVICES.METRICS_REGISTRY);

    const app = express();

    app.use('/metrics', metricsMiddleware(registry));

    const server = livenessFactory(createServer(app));

    cleanupRegistry.register({
      id: 'server',
      func: async () => {
        return new Promise((resolve) => {
          server.once('close', resolve);
          server.close();
        });
      },
    });

    const serverConfig = config.get<IServerConfig>('server');
    const port: number = parseInt(serverConfig.port) || DEFAULT_PORT;

    server.listen(port, () => {
      const logger = container.resolve<Logger>(SERVICES.LOGGER);
      logger.debug(`liveness on port ${port}`);
    });

    await cli.parseAsync(hideBin(process.argv));

    await shutDownFn();
  })
  .catch(async (error: Error) => {
    const errorLogger =
      depContainer?.isRegistered(SERVICES.LOGGER) === true
        ? depContainer.resolve<Logger>(SERVICES.LOGGER).error.bind(depContainer.resolve<Logger>(SERVICES.LOGGER))
        : console.error;

    errorLogger({ msg: 'something went wrong', err: error });

    await shutDownFn();
  })
  .finally(() => {
    exitProcess();
  });
