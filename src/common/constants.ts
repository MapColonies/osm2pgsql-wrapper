import { readPackageJsonSync } from '@map-colonies/read-pkg';

export const CLI_NAME = readPackageJsonSync().name ?? 'unknown_cli';

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

export const CLI_BUILDER = Symbol('cliBuilder');
export const EXIT_CODE = Symbol('exitCode');
export const ON_SIGNAL = Symbol('onSignal');

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES: Record<string, symbol> = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METER: Symbol('Meter'),
  S3: Symbol('S3'),
  HTTP_CLIENT: Symbol('HttpClient'),
  CONFIG_STORE: Symbol('ConfigStore'),
  ARSTOTZKA: Symbol('Arstotzka'),
  CLEANUP_REGISTRY: Symbol('CleanupRegistry'),
};

export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  OSM2PGSQL_ERROR: 100,
  S3_ERROR: 101,
  INVALID_STATE_FILE_ERROR: 102,
  REMOTE_SERVICE_RESPONSE_ERROR: 103,
  REMOTE_SERVICE_UNAVAILABLE: 104,
  DUMP_SERVER_EMPTY_RESPONSE_ERROR: 105,
  OSMIUM_ERROR: 106,
  QUEUE_ERROR: 107,
  BUCKET_DOES_NOT_EXIST_ERROR: 108,
  INVALID_GEOMETRY_ERROR: 109,
  REMOTE_RESOURCE_NOT_FOUND_ERROR: 110,
};

export const NOT_FOUND_INDEX = -1;
export const S3_REGION = 'us-east-1';
export const DATA_DIR = '/tmp';
export const STATE_FILE = 'state.txt';
export const DEFAULT_DUMP_NAME = 'dump.osm.pbf';
export const EXPIRE_LIST = 'expire.list';
export const DIFF_FILE_EXTENTION = 'osc.gz';
export const DEFAULT_SEQUENCE_NUMBER = -1;
export const DEFAULT_PROJECT_CREATION_STATE = 1;
export const SEQUENCE_NUMBER = 'sequenceNumber';
export const SEQUENCE_NUMBER_REGEX = /sequenceNumber=\d+/;
export const SEQUENCE_NUMBER_PADDING_AMOUNT = 3;
export const DIFF_TOP_DIR_DIVIDER = 1000000;
export const DIFF_BOTTOM_DIR_DIVIDER = 1000;
export const DIFF_STATE_FILE_MODULO = 1000;
