import { readFileSync } from 'fs';
import pgBoss, { DatabaseOptions } from 'pg-boss';
import { CLI_NAME } from '../common/constants';

const createDatabaseOptions = (dbConfig: DbConfig): DatabaseOptions => {
  const { enableSslAuth, sslPaths, ...databaseOptions } = dbConfig;
  databaseOptions.application_name = CLI_NAME;
  if (enableSslAuth) {
    databaseOptions.password = undefined;
    const [ca, cert, key] = [readFileSync(sslPaths.ca), readFileSync(sslPaths.cert), readFileSync(sslPaths.key)];
    databaseOptions.ssl = { key, cert, ca };
  }
  return databaseOptions;
};

export type DbConfig = {
  enableSslAuth: boolean;
  sslPaths: { ca: string; cert: string; key: string };
  certSecretName: string;
} & DatabaseOptions;

export const pgBossFactory = (dbConfig: DbConfig): pgBoss => {
  const databaseOptions = createDatabaseOptions(dbConfig);
  return new pgBoss({ ...databaseOptions, noScheduling: true, noSupervisor: true });
};
