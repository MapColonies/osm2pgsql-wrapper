import { BoundingBox } from '@map-colonies/tile-calc';
import SphericalMercator from '@mapbox/sphericalmercator';
import { Sort } from '../../../common/types';
import { sortArrAlphabetically } from '../../../common/util';

interface Tile {
  x: number;
  y: number;
}

const sphericalMercatorUtil = new SphericalMercator({});

const fetchMaxZoom = (sortedTiles: string[], sort?: Sort): number => {
  const index = sort === 'desc' ? 0 : sortedTiles.length - 1;
  const zoom = sortedTiles[index].split('/')[0];
  return parseInt(zoom);
};

const buildTileMatrix = (sortedTiles: string[], zoom: number): Tile[][] => {
  const tileMatrix: Tile[][] = [];

  sortedTiles.forEach((expireTileLine) => {
    const elements = expireTileLine.split('/');
    const currentZ = parseInt(elements[0]);

    if (currentZ !== zoom) {
      return;
    }

    const currentX = parseInt(elements[1]);
    const currentY = parseInt(elements[2]);
    const currentTile = { x: currentX, y: currentY };

    if (tileMatrix.length === 0) {
      tileMatrix.push([currentTile]);
      return;
    }

    const lastRangeIndex = tileMatrix.length - 1;
    const lastTileInRangeIndex = tileMatrix[lastRangeIndex].length - 1;
    const lastTile = tileMatrix[lastRangeIndex][lastTileInRangeIndex];

    if (currentTile.x === lastTile.x && currentTile.y === lastTile.y - 1) {
      tileMatrix[lastRangeIndex].push(currentTile);
      return;
    }

    tileMatrix.push([currentTile]);
  });

  return tileMatrix;
};

const buildBboxArr = (tileMatrix: Tile[][], zoom: number): BoundingBox[] => {
  const bboxArray = tileMatrix.map((tileRange) => {
    const bottomTile = tileRange[0];
    const topTile = tileRange[tileRange.length - 1];

    const [west, south] = sphericalMercatorUtil.bbox(bottomTile.x, bottomTile.y, zoom); // getting min longitude and min latitude
    const [, , east, north] = sphericalMercatorUtil.bbox(topTile.x, topTile.y, zoom); // getting max longitude and max latitude

    return { west, south, east, north };
  });

  return bboxArray;
};

export const expireListToBboxArray = (expireListArr: string[]): BoundingBox[] => {
  const sortedExpireList = sortArrAlphabetically(expireListArr, 'desc');

  const zoom = fetchMaxZoom(sortedExpireList, 'desc');

  const matrix = buildTileMatrix(sortedExpireList, zoom);

  return buildBboxArr(matrix, zoom);
};
