/* eslint-disable import/first */
// this import must be called before the first import of tsyring
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ON_SIGNAL } from './common/constants';
import { getCli } from './cli';
import { hideBin } from 'yargs/helpers';

void getCli()
  .parseAsync(hideBin(process.argv))
  .catch((error: Error) => {
    console.error('failed initializing the cli');
    console.error(error.message);
  })
  .finally(async () => {
    const shutDown: () => Promise<void> = container.resolve(ON_SIGNAL);
    await shutDown();
  });
