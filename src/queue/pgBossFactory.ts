import { readFileSync } from 'fs';
import { PgBoss, type ConstructorOptions } from 'pg-boss';
import { CLI_NAME } from '../common/constants';

const createDatabaseOptions = (dbConfig: DbConfig): ConstructorOptions => {
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
} & ConstructorOptions;

export const pgBossFactory = (dbConfig: DbConfig): PgBoss => {
  const databaseOptions = createDatabaseOptions(dbConfig);
  return new PgBoss({ ...databaseOptions });
};
