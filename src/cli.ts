import { registerExternalValues, RegisterOptions } from './containerConfig';
import { CliBuilder } from './cliBuilder';

export const getCli = (registerOptions?: RegisterOptions): CliBuilder => {
  const container = registerExternalValues(registerOptions);
  const cli = container.resolve(CliBuilder).build();
  return cli;
};
