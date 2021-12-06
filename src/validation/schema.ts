import { JSONSchemaType } from 'ajv';

export interface AppendEntity {
  id: string;
  script: string;
  zoomLevel: {
    min: number;
    max?: number;
  };
}

const ZOOM_LEVEL_MINIMUM = 0;
const ZOOM_LEVEL_MAXIMUM = 20;

// TODO add exclusiveMinimum: { $data: '1/min' }
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
          max: { type: 'number', maximum: ZOOM_LEVEL_MAXIMUM, nullable: true },
        },
        required: ['min'],
      },
    },
    required: ['id', 'script', 'zoomLevel'],
    additionalProperties: false,
  },
  uniqueItemProperties: ['id'],
  minItems: 1,
};
