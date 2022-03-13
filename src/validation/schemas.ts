import { JSONSchemaType } from 'ajv';
import { QueueSettings } from '../cli/commands/append/interfaces';

const ZOOM_LEVEL_MINIMUM = 1;
const ZOOM_LEVEL_MAXIMUM = 20;

export interface AppendEntity {
  id: string;
  script: string;
  zoomLevel?: {
    min: number;
    max?: number;
  };
}

export const APPEND_CONFIG_SCHEMA: JSONSchemaType<AppendEntity[]> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      script: { type: 'string' },
      zoomLevel: {
        type: 'object',
        properties: {
          min: {
            type: 'number',
            minimum: ZOOM_LEVEL_MINIMUM,
            maximum: ZOOM_LEVEL_MAXIMUM,
          },
          max: { type: 'number', minimum: ZOOM_LEVEL_MINIMUM, maximum: ZOOM_LEVEL_MAXIMUM, nullable: true },
        },
        required: ['min'],
        nullable: true,
      },
    },
    required: ['id', 'script'],
    additionalProperties: false,
  },
  uniqueItemProperties: ['id'],
  minItems: 1,
};

export const QUEUE_SETTINGS_SCHEMA: JSONSchemaType<QueueSettings> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    minZoom: { type: 'number', minimum: ZOOM_LEVEL_MINIMUM, maximum: ZOOM_LEVEL_MAXIMUM },
    maxZoom: { type: 'number', minimum: ZOOM_LEVEL_MINIMUM, maximum: ZOOM_LEVEL_MAXIMUM },
  },
  required: ['name', 'minZoom', 'maxZoom'],
  additionalProperties: false,
};

export interface Limit {
  limit?: number;
}

export const LIMIT_SCHEMA: JSONSchemaType<Limit> = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, nullable: true },
  },
};
