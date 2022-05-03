import { Argv } from 'yargs';
import { registerExternalValues, RegisterOptions } from '../containerConfig';
import { CLI_BUILDER } from '../common/constants';

export const getCli = async (registerOptions?: RegisterOptions): Promise<Argv> => {
  const container = await registerExternalValues(registerOptions);
  const cli = container.resolve<Argv>(CLI_BUILDER);
  return cli;
};
