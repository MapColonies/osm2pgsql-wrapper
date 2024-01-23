import { BoundingBox } from '@map-colonies/tile-calc';
import { Feature } from '@turf/turf';
import { GlobalArguments } from '../../cliBuilderFactory';

interface BaseTilesRequest {
  minZoom: number;
  maxZoom: number;
}

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

export interface TileRequestQueuePayloadItem<A = BoundingBox | Feature> extends BaseTilesRequest {
  area: A;
}

export interface TileRequestQueuePayload<A = BoundingBox | Feature> {
  items: TileRequestQueuePayloadItem<A>[];
  source: 'expiredTiles';
  state?: number;
  force?: boolean;
}
