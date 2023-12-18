import { MediatorConfig } from '@map-colonies/arstotzka-mediator';
import { LogLevel, OutputType, ResourceType } from './types';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface IServerConfig {
  port: string;
}

export interface LogFn {
  (obj: unknown, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}

export interface ILogger {
  trace?: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal?: LogFn;
}

export interface Osm2pgsqlConfig {
  slim?: boolean;
  cache: number;
  processes: number;
  output: OutputType;
  expireOutput: boolean;
  schema?: string;
  middleSchema?: string;
  logger: {
    level: LogLevel;
    progress: boolean;
    sql: boolean;
    sqlData: boolean;
  };
}

export interface OsmiumConfig {
  verbose: boolean;
  progress: boolean;
}

export interface RemoteResource {
  id: string;
  type: ResourceType;
}

export interface ArstotzkaConfig {
  enabled: boolean;
  serviceId: string;
  mediator: MediatorConfig;
}
