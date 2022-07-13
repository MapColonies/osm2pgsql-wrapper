/* eslint-disable @typescript-eslint/no-magic-numbers */
import { Polygon } from '@turf/turf';

export const WEST_GLOBE_BBOX_FOR_FILTER = [0, -90, 180, 90];

export const TOP_WEST_GLOBE_BBOX_FOR_FILTER = [0, 0, 180, 90];

export const WHOLE_GLOBE_BBOX = {
  west: -180,
  south: -85.05112877980659,
  east: 180,
  north: 85.0511287798066,
};

export const EAST_GLOBE_BBOX = {
  west: -180,
  south: -85.05112877980659,
  east: 0,
  north: 85.0511287798066,
};

export const WEST_GLOBE_BBOX = {
  west: 0,
  south: -85.05112877980659,
  east: 180,
  north: 85.0511287798066,
};

export const TOP_WEST_GLOBE_BBOX = {
  west: 0,
  south: 0,
  east: 180,
  north: 85.0511287798066,
};

export const bboxToGeojson = (bbox: number[]): Polygon => {
  const [west, south, east, north] = bbox;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
};
