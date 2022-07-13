import { LogLevel, OutputType, ResourceType } from './types';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface Osm2pgsqlConfig {
  slim?: boolean;
  cache: number;
  processes: number;
  output: OutputType;
  expireOutput: boolean;
  logger: {
    level: LogLevel;
    progress: boolean;
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
