import { MediatorConfig } from '@map-colonies/arstotzka-mediator';
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
  middleSchema: string;
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

export interface ArstotzkaConfig {
  enabled: boolean;
  serviceId: string;
  mediator: MediatorConfig;
}
