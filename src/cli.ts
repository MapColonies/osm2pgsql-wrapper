import { registerExternalValues, RegisterOptions } from './containerConfig';
import { Argv } from 'yargs';
import { CLI_BUILDER } from './common/constants';

export const getCli = (registerOptions?: RegisterOptions): Argv => {
  const container = registerExternalValues(registerOptions);
  return container.resolve<Argv>(CLI_BUILDER);
};
