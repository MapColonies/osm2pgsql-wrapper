/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import { container } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { hideBin } from 'yargs/helpers';
import { ExitCodes, EXIT_CODE, SERVICES } from './common/constants';
import { getCli } from './cli/cli';
import { ShutdownHandler } from './common/shutdownHandler';

const exitProcess = (): void => {
  const exitCode = container.isRegistered(EXIT_CODE) ? container.resolve<number>(EXIT_CODE) : ExitCodes.GENERAL_ERROR;
  process.exit(exitCode);
};

void getCli()
  .then(async (cli) => {
    await cli.parseAsync(hideBin(process.argv));
  })
  .catch((error: Error) => {
    const errorLogger = container.isRegistered(SERVICES.LOGGER) ? container.resolve<Logger>(SERVICES.LOGGER).error : console.error;
    errorLogger('failed initializing the cli');
    errorLogger(error);
  })
  .finally(() => {
    if (!container.isRegistered(ShutdownHandler)) {
      exitProcess();
    }
    const shutdownHandler = container.resolve(ShutdownHandler);
    void shutdownHandler.onShutdown().then(() => {
      exitProcess();
    });
  });
