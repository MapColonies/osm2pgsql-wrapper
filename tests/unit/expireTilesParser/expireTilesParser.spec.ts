import { getFilterByBboxFunc, getFilterByGeojsonFunc, getFilterByZoomFunc } from '../../../src/cli/commands/append/expireTilesFilters';
import { ExpireTilesParser } from '../../../src/cli/commands/append/expireTilesParser';
import {
  WEST_GLOBE_BBOX,
  WHOLE_GLOBE_BBOX,
  EAST_GLOBE_BBOX,
  TOP_WEST_GLOBE_BBOX,
  bboxToGeojson,
  TOP_WEST_GLOBE_BBOX_FOR_FILTER,
  WEST_GLOBE_BBOX_FOR_FILTER,
} from './helper';

describe('ExpireTilesParser', () => {
  describe('parseExpireListToFilteredBbox', () => {
    it('should parse without filters empty list into empty bbox', function () {
      const parser = new ExpireTilesParser();
      const bbox = parser.parseExpireListToFilteredBbox([]);

      expect(bbox).toMatchObject([]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse with max zoom filter empty list into empty bbox', function () {
      const parser = new ExpireTilesParser({ filterMaxZoom: true });
      const bbox = parser.parseExpireListToFilteredBbox([]);

      expect(bbox).toMatchObject([]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse without filters list into desc order bbox', function () {
      const parser = new ExpireTilesParser({ sort: 'desc' });
      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1']);

      expect(bbox).toMatchObject([EAST_GLOBE_BBOX, WHOLE_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse without filters list into asc order bbox', function () {
      const parser = new ExpireTilesParser({ sort: 'asc' });
      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1']);

      expect(bbox).toMatchObject([WHOLE_GLOBE_BBOX, EAST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse without filters list into desc order bbox', function () {
      const parser = new ExpireTilesParser({ sort: 'desc' });
      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([WEST_GLOBE_BBOX, EAST_GLOBE_BBOX, WHOLE_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse without filters list into asc order bbox', function () {
      const parser = new ExpireTilesParser({ sort: 'asc' });
      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([WHOLE_GLOBE_BBOX, EAST_GLOBE_BBOX, WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse with max zoom filter list into bbox', function () {
      const parser = new ExpireTilesParser({ filterMaxZoom: true, sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([WEST_GLOBE_BBOX, EAST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse with non existing zoom level filter list into empty bbox', function () {
      const zoomFilter = getFilterByZoomFunc(-1);

      const parser = new ExpireTilesParser({ preFilters: [zoomFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(0);
    });

    it('should parse with bbox filter list into bbox of one containing tiles', function () {
      const bboxFilter = getFilterByBboxFunc(WEST_GLOBE_BBOX_FOR_FILTER);

      const parser = new ExpireTilesParser({ postFilters: [bboxFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with bbox filter list into empty bbox due to no tiles being contained', function () {
      const bboxFilter = getFilterByBboxFunc([1, 2, 3, 4]);

      const parser = new ExpireTilesParser({ postFilters: [bboxFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with bbox and zoom filters list into bbox of one containing tiles, some are range', function () {
      const bboxFilter = getFilterByBboxFunc(TOP_WEST_GLOBE_BBOX_FOR_FILTER);

      const parser = new ExpireTilesParser({ postFilters: [bboxFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['1/0/0', '1/0/1', '1/1/0', '1/1/1', '2/2/0', '2/2/1']);

      expect(bbox).toMatchObject([{ west: 0, south: 0, east: 90, north: 85.0511287798066 }, TOP_WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with bbox and zoom filters list into bbox of one containing tiles', function () {
      const bboxFilter = getFilterByBboxFunc(TOP_WEST_GLOBE_BBOX_FOR_FILTER);
      const parser = new ExpireTilesParser({ filterMaxZoom: true, postFilters: [bboxFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([TOP_WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with geojson filter list into bbox of one containing tiles', function () {
      const geojson = bboxToGeojson(WEST_GLOBE_BBOX_FOR_FILTER);
      const geojsonFilter = getFilterByGeojsonFunc(geojson);

      const parser = new ExpireTilesParser({ postFilters: [geojsonFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with geojson filter list into empty bbox due to no tiles being contained', function () {
      const geojson = bboxToGeojson([1, 2, 3, 4]);
      const geojsonFilter = getFilterByGeojsonFunc(geojson);

      const parser = new ExpireTilesParser({ postFilters: [geojsonFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with geojson filter list into bbox of one containing tiles, some are range', function () {
      const geojson = bboxToGeojson(TOP_WEST_GLOBE_BBOX_FOR_FILTER);
      const geojsonFilter = getFilterByGeojsonFunc(geojson);

      const parser = new ExpireTilesParser({ postFilters: [geojsonFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['1/0/0', '1/0/1', '1/1/0', '1/1/1', '2/2/0', '2/2/1']);

      expect(bbox).toMatchObject([{ west: 0, south: 0, east: 90, north: 85.0511287798066 }, TOP_WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(0);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with geojson and max zoom filters list into bbox of one containing tiles', function () {
      const geojson = bboxToGeojson(TOP_WEST_GLOBE_BBOX_FOR_FILTER);
      const geojsonFilter = getFilterByGeojsonFunc(geojson);

      const parser = new ExpireTilesParser({ filterMaxZoom: true, postFilters: [geojsonFilter], sort: 'desc' });

      const bbox = parser.parseExpireListToFilteredBbox(['0/0/0', '1/0/0', '1/0/1', '1/1/0', '1/1/1']);

      expect(bbox).toMatchObject([TOP_WEST_GLOBE_BBOX]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(1);
    });

    it('should parse with geojson and max zoom filters list into bbox of one containing tiles, some are range', function () {
      const geojson = bboxToGeojson(TOP_WEST_GLOBE_BBOX_FOR_FILTER);
      const geojsonFilter = getFilterByGeojsonFunc(geojson);

      const parser = new ExpireTilesParser({ filterMaxZoom: true, postFilters: [geojsonFilter], sort: 'asc' });

      const bbox = parser.parseExpireListToFilteredBbox(['1/0/0', '1/0/1', '1/1/0', '1/1/1', '2/2/0', '2/2/1']);

      expect(bbox).toMatchObject([{ west: 0, south: 0, east: 90, north: 85.0511287798066 }]);
      expect(parser.getPreFilters.length).toEqual(1);
      expect(parser.getPostFilters.length).toEqual(1);
    });
  });
});
