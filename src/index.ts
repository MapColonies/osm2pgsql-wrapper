/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import './common/tracing';
import { Logger } from '@map-colonies/js-logger';
import { hideBin } from 'yargs/helpers';
import { DependencyContainer } from 'tsyringe';
import { ExitCodes, EXIT_CODE, ON_SIGNAL, SERVICES } from './common/constants';
import { getCli } from './cli/cli';

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
