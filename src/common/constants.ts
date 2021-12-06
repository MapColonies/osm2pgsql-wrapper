import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const CLI_NAME = readPackageJsonSync().name ?? 'unknown_cli';

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES: Record<string, symbol> = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METER: Symbol('Meter'),
  S3: Symbol('S3'),
  HTTP_CLIENT: Symbol('HttpClient'),
};

export const ON_SIGNAL = Symbol('onSignal');

export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  // OSMDBT_ERROR: 100,
  GET_OBJECT_ERROR: 101,
  INVALID_STATE_FILE_ERROR: 102,
  PUT_OBJECT_ERROR: 103,
  // ROLLBACK_FAILURE_ERROR: 104,
  HTTP_ERROR: 105,
  TERMINATED: 130,
};

export const OSM2PGSQL_PATH = '/osm2pgsql/osm2pgsql';
export const DATA_DIR = '/tmp';
export const STATE_FILE = 'state.txt';
export const DEFAULT_SEQUENCE_NUMBER = '-1';
export const SEQUENCE_NUMBER_REGEX = /sequenceNumber=\d+/;
