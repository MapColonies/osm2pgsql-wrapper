import { BoundingBox } from '@map-colonies/tile-calc';
import SphericalMercator from '@mapbox/sphericalmercator';
import { applyFuncLineByLine } from '../../../common/util';

const sphericalMercatorUtil = new SphericalMercator({});

export const expireListStreamToBboxArray = async (expireListStream: NodeJS.ReadableStream): Promise<BoundingBox[]> => {
  const bboxArray: BoundingBox[] = [];

  await applyFuncLineByLine(expireListStream, (expireTileLine) => {
    const elements = expireTileLine.split('/');
    const z = parseInt(elements[0]);
    const x = parseInt(elements[1]);
    const y = parseInt(elements[2]);
    const [west, south, east, north] = sphericalMercatorUtil.bbox(x, y, z);
    const bbox: BoundingBox = { west, south, east, north };
    bboxArray.push(bbox);
  });

  return bboxArray;
};
