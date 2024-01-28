import { BoundingBox } from '@map-colonies/tile-calc';
import SphericalMercator from '@mapbox/sphericalmercator';
import { Sort } from '../../../common/types';
import { sortArrAlphabetically } from '../../../common/util';
import { ExpireTilePostFilterFunc, ExpireTilePreFilterFunc, getFilterByZoomFunc } from './expireTilesFilters';

interface Tile {
  z: number;
  x: number;
  y: number;
  bbox: BoundingBox;
}

interface ParseExpireListOptions {
  filterMaxZoom?: boolean;
  preFilters?: ExpireTilePreFilterFunc[];
  postFilters?: ExpireTilePostFilterFunc[];
  sort?: Sort;
}

const ASC_ORDER_NEXT_IN_RANGE_DIFF_VALUE = 1;
const DESC_ORDER_NEXT_IN_RANGE_DIFF_VALUE = -1;

const sphericalMercatorUtil = new SphericalMercator({});

export class ExpireTilesParser {
  private readonly preFilters: ExpireTilePreFilterFunc[];
  private readonly postFilters: ExpireTilePostFilterFunc[];
  private readonly filterMaxZoom: boolean;
  private readonly sort: Sort;

  public constructor(options: ParseExpireListOptions = {}) {
    const { preFilters = [], postFilters = [], filterMaxZoom = false, sort = 'desc' } = options;

    this.preFilters = preFilters;
    this.postFilters = postFilters;
    this.filterMaxZoom = filterMaxZoom;
    this.sort = sort;
  }

  public get getPreFilters(): ExpireTilePreFilterFunc[] {
    return this.preFilters;
  }

  public get getPostFilters(): ExpireTilePostFilterFunc[] {
    return this.postFilters;
  }

  public parseExpireListToFilteredBbox(expireList: string[]): BoundingBox[] {
    expireList = sortArrAlphabetically(expireList, this.sort);

    if (this.filterMaxZoom) {
      const maxZoom = this.getMaxZoom(expireList);
      const maxZoomFilter = getFilterByZoomFunc(maxZoom);
      this.preFilters.push(maxZoomFilter);
    }

    // apply pre filters on the list
    expireList = expireList.filter((line) => this.preFilters.every((filter) => filter(line)));

    // apply post filters on each tile after parsing it into bbox, return only the ones that passed the filter
    const tiles = this.expireListToFilteredTiles(expireList);

    // build tile ranges
    const tileRanges = this.buildTileRange(tiles);

    // build bbox from every range
    const bboxRanges = this.buildBboxRange(tileRanges);

    return bboxRanges;
  }

  private getMaxZoom(sortedExpireList: string[]): number {
    if (sortedExpireList.length === 0) {
      return 0;
    }

    const index = this.sort === 'desc' ? 0 : sortedExpireList.length - 1;
    const zoom = sortedExpireList[index].split('/')[0];
    return parseInt(zoom);
  }

  private expireListToFilteredTiles(expireList: string[]): Tile[] {
    const tiles: Tile[] = [];

    expireList.forEach((expireTileLine) => {
      const elements = expireTileLine.split('/');

      const currentZ = parseInt(elements[0]);
      const currentX = parseInt(elements[1]);
      const currentY = parseInt(elements[2]);

      // convert to 4326 (WGS84)
      const [west, south, east, north] = sphericalMercatorUtil.bbox(currentX, currentY, currentZ);
      const bbox = { west, south, east, north };

      const hasPassedFilters = this.postFilters.every((filter) => filter(bbox));
      if (hasPassedFilters) {
        tiles.push({ z: currentZ, x: currentX, y: currentY, bbox });
      }
    });

    return tiles;
  }

  private buildTileRange(tiles: Tile[]): Tile[][] {
    const tileRange: Tile[][] = [];

    tiles.forEach((tile) => {
      if (tileRange.length === 0) {
        tileRange.push([tile]);
        return;
      }

      const lastRangeIndex = tileRange.length - 1;
      const lastTileInRangeIndex = tileRange[lastRangeIndex].length - 1;
      const lastTile = tileRange[lastRangeIndex][lastTileInRangeIndex];

      const diff = this.sort === 'asc' ? ASC_ORDER_NEXT_IN_RANGE_DIFF_VALUE : DESC_ORDER_NEXT_IN_RANGE_DIFF_VALUE;
      if (tile.z === lastTile.z && tile.x === lastTile.x && tile.y === lastTile.y + diff) {
        tileRange[lastRangeIndex].push(tile);
        return;
      }

      tileRange.push([tile]);
    });

    return tileRange;
  }

  private buildBboxRange(tileRanges: Tile[][]): BoundingBox[] {
    return tileRanges.map((tileRange) => {
      const bottomIndex = this.sort === 'desc' ? 0 : tileRange.length - 1;
      const topIndex = this.sort === 'desc' ? tileRange.length - 1 : 0;

      const bottomTile = tileRange[bottomIndex];
      const topTile = tileRange[topIndex];

      const { west, south } = bottomTile.bbox; // getting min longitude and min latitude from bottom of the range
      const { east, north } = topTile.bbox; // getting max longitude and max latitude from top of the range

      return { west, south, east, north };
    });
  }
}
