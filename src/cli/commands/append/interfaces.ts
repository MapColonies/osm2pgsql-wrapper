import { BoundingBox } from '@map-colonies/tile-calc';
import { GlobalArguments } from '../../cliBuilderFactory';

export interface BaseAppendArguments extends GlobalArguments {
  config: string;
  replicationUrl: string;
  s3Acl: string;
  forever?: boolean;
  waitTimeSeconds?: number;
  uploadTargets: string[];
}

export interface QueueSettings {
  name: string;
  minZoom: number;
  maxZoom: number;
}

export type AppendArguments = BaseAppendArguments & Partial<QueueSettings>;

export interface TileRequestQueuePayload {
  bbox: BoundingBox[];
  minZoom: number;
  maxZoom: number;
  source: 'api' | 'expiredTiles';
}
