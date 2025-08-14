import { BoundingBox } from '@map-colonies/tile-calc';
import { booleanContains } from '@turf/turf';
import type { Feature, Geometry, Polygon } from 'geojson';
import { BBox } from '@src/common/types';

const basePolygon: Polygon = {
  type: 'Polygon',
  coordinates: [[]],
};

export type ExpireTilePreFilterFunc = (expireList: string) => boolean;
export type ExpireTilePostFilterFunc = (bbox: BoundingBox) => boolean;

export const getFilterByZoomFunc = (zoom: number): ExpireTilePreFilterFunc => {
  const filter: ExpireTilePreFilterFunc = (expireTile) => {
    const elements = expireTile.split('/');
    const zoomValue = parseInt(elements[0] as string);
    return zoomValue === zoom;
  };
  return filter;
};

export const getFilterByGeojsonFunc = (geometry: Feature | Geometry): ExpireTilePostFilterFunc => {
  const filter: ExpireTilePostFilterFunc = (bbox) => {
    const { west, south, east, north } = bbox;
    const bboxAsPolygon: Polygon = {
      ...basePolygon,
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
    return booleanContains(geometry, bboxAsPolygon);
  };
  return filter;
};

export const getFilterByBboxFunc = (containingBbox: BBox): ExpireTilePostFilterFunc => {
  const filter: ExpireTilePostFilterFunc = (bbox) => {
    const { west, south, east, north } = bbox;
    return west >= containingBbox[0] && south >= containingBbox[1] && east <= containingBbox[2] && north <= containingBbox[3];
  };
  return filter;
};
