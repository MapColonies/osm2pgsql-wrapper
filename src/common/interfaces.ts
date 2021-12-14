import { LogLevel, OutputType } from './types';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface Osm2pgsqlConfig {
  slim?: boolean;
  cache: number;
  processes: number;
  output: OutputType;
  logger: {
    level: LogLevel;
    progress: boolean;
  };
}

export interface OsmiumConfig {
  verbose: boolean;
  progress: boolean;
}
