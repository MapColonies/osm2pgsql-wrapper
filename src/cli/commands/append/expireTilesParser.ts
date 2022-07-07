import { BoundingBox } from '@map-colonies/tile-calc';
import SphericalMercator from '@mapbox/sphericalmercator';
import { Sort } from '../../../common/types';
import { sortArrAlphabetically } from '../../../common/util';
import { ExpireTilePostFilterFunc, ExpireTilePreFilterFunc } from './expireTilesFilters';

interface Tile {
  x: number;
  y: number;
}

const buildTileRanges = (sortedTiles: string[]): Tile[][] => {
  const tileRange: Tile[][] = [];

  sortedTiles.forEach((expireTileLine) => {
    const elements = expireTileLine.split('/');

    const currentX = parseInt(elements[1]);
    const currentY = parseInt(elements[2]);
    const currentTile = { x: currentX, y: currentY };

    if (tileRange.length === 0) {
      tileRange.push([currentTile]);
      return;
    }

    const lastRangeIndex = tileRange.length - 1;
    const lastTileInRangeIndex = tileRange[lastRangeIndex].length - 1;
    const lastTile = tileRange[lastRangeIndex][lastTileInRangeIndex];

    if (currentTile.x === lastTile.x && currentTile.y === lastTile.y - 1) {
      tileRange[lastRangeIndex].push(currentTile);
      return;
    }

    tileRange.push([currentTile]);
  });

  return tileRange;
};

const sphericalMercatorUtil = new SphericalMercator({});

export class ExpireTilesParser {
  public readonly maxZoom: number;
  public constructor(private expireList: string[], private readonly sort: Sort = 'desc') {
    this.maxZoom = this.getMaxZoom();
  }

  public parseExpireListToFilteredBbox(preFilters: ExpireTilePreFilterFunc[] = [], postFilters: ExpireTilePostFilterFunc[] = []): BoundingBox[] {
    // sort for performance
    this.expireList = sortArrAlphabetically(this.expireList, this.sort);

    // apply pre filters on the list
    this.expireList = this.expireList.filter((line) => preFilters.every((filter) => filter(line)));

    // build tile ranges then the bbox array
    const tileRanges = buildTileRanges(this.expireList);
    let bboxArray = this.buildBboxArray(tileRanges, this.maxZoom);

    // apply post filters on the bbox array
    bboxArray = bboxArray.filter((bbox) => postFilters.every((filter) => filter(bbox)));

    return bboxArray;
  }

  private getMaxZoom(): number {
    const index = this.sort === 'desc' ? 0 : this.expireList.length - 1;
    const zoom = this.expireList[index].split('/')[0];
    return parseInt(zoom);
  }

  private buildBboxArray(tileRanges: Tile[][], zoom: number): BoundingBox[] {
    const bboxArray = tileRanges.map((tileRange) => {
      const bottomTile = tileRange[0];
      const topTile = tileRange[tileRange.length - 1];

      const [west, south] = sphericalMercatorUtil.bbox(bottomTile.x, bottomTile.y, zoom); // getting min longitude and min latitude
      const [, , east, north] = sphericalMercatorUtil.bbox(topTile.x, topTile.y, zoom); // getting max longitude and max latitude

      return { west, south, east, north };
    });

    return bboxArray;
  }
}
