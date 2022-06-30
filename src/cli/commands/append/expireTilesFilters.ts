import { BoundingBox } from '@map-colonies/tile-calc';
import { booleanContains, Feature, Geometry, Polygon } from '@turf/turf';

export type ExpireTilesPreFilterFunc = (expireList: string[]) => string[];
export type ExpireTilesPostFilterFunc = (bbox: BoundingBox[]) => BoundingBox[];

export const filterByZoom = (zoom: number): ExpireTilesPreFilterFunc => {
  const filter: ExpireTilesPreFilterFunc = (expireList) => {
    return expireList.filter((expireTileLine) => {
      const elements = expireTileLine.split('/');
      const zoomValue = parseInt(elements[0]);
      return zoomValue === zoom;
    });
  };
  return filter;
};

export const filterByGeometry = (geometry: Feature | Geometry): ExpireTilesPostFilterFunc => {
  const filter: ExpireTilesPostFilterFunc = (bbox) => {
    return bbox.filter((bboxItem) => {
      const { west, south, east, north } = bboxItem;
      const bboxAsPolygon: Polygon = {
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
      return booleanContains(geometry, bboxAsPolygon);
    });
  };
  return filter;
};
