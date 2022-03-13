import { BoundingBox } from '@map-colonies/tile-calc';
import SphericalMercator from '@mapbox/sphericalmercator';
import { Sort } from '../../../common/types';
import { convertStreamToLinesArr, sortArrAlphabetically } from '../../../common/util';

interface Coordinates {
  x: number;
  y: number;
}

const sphericalMercatorUtil = new SphericalMercator({});

const fetchMaxZoom = (sortedTiles: string[], sort?: Sort): number => {
  const index = sort === 'desc' ? 0 : sortedTiles.length - 1;
  const zoom = sortedTiles[index].split('/')[0];
  return parseInt(zoom);
};

const buildCoordinatesMatrix = (sortedTiles: string[], zoom: number): Coordinates[][] => {
  const coordinatesMatrix: Coordinates[][] = [];

  sortedTiles.forEach((expireTileLine) => {
    const elements = expireTileLine.split('/');
    const currentZ = parseInt(elements[0]);

    if (currentZ !== zoom) {
      return;
    }

    const currentX = parseInt(elements[1]);
    const currentY = parseInt(elements[2]);

    if (coordinatesMatrix.length === 0) {
      coordinatesMatrix.push([{ x: currentX, y: currentY }]);
      return;
    }

    const lastBox = coordinatesMatrix.length - 1;
    const lastCoordinatesInBox = coordinatesMatrix[lastBox].length - 1;
    const lastCoordinates = coordinatesMatrix[lastBox][lastCoordinatesInBox];

    if (currentX === lastCoordinates.x && currentY === lastCoordinates.y - 1) {
      coordinatesMatrix[lastBox].push({ x: currentX, y: currentY });
      return;
    }

    coordinatesMatrix.push([{ x: currentX, y: currentY }]);
  });

  return coordinatesMatrix;
};

const buildBboxArr = (coordinatesMatrix: Coordinates[][], zoom: number): BoundingBox[] => {
  const bboxArray = coordinatesMatrix.map((coordinatesRange) => {
    const first = coordinatesRange[0];
    const last = coordinatesRange[coordinatesRange.length - 1];

    const [west, north] = sphericalMercatorUtil.bbox(first.x, first.y, zoom);
    const [south, east] = sphericalMercatorUtil.bbox(last.x, last.y, zoom);

    return { west, south, east, north };
  });

  return bboxArray;
};

export const expireListStreamToBboxArray = async (expireListStream: NodeJS.ReadableStream): Promise<BoundingBox[]> => {
  const expireListArr = await convertStreamToLinesArr(expireListStream);

  const sortedExpireList = sortArrAlphabetically(expireListArr, 'desc');

  const zoom = fetchMaxZoom(sortedExpireList, 'desc');

  const matrix = buildCoordinatesMatrix(sortedExpireList, zoom);

  return buildBboxArr(matrix, zoom);
};
