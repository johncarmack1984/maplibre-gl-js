import {describe, test, expect} from 'vitest';
import {isInBoundsForTileZoomXY, isInBoundsForZoomLngLat} from './world_bounds.ts';
import {MAX_TILE_ZOOM, MIN_TILE_ZOOM} from './util.ts';
import {LngLat} from '../geo/lng_lat.ts';
import {mercatorWorldCoordinates} from '../geo/projection/world_coordinate_helper.ts';
import {PlanarProjection} from '../geo/projection/planar_projection.ts';
import {createRotatedCrs} from './test/util.ts';

describe('isInBoundsForTileZoomXY', () => {

    test('at zoom bounds', () => {
        const x = 0, y = 0;
        expect(isInBoundsForTileZoomXY(MIN_TILE_ZOOM, x, y)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(MIN_TILE_ZOOM - 1, x, y)).toBeFalsy();
        expect(isInBoundsForTileZoomXY(MAX_TILE_ZOOM, x, y)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(MAX_TILE_ZOOM + 1, x, y)).toBeFalsy();
    });

    test('at X bounds', () => {
        const z = 2, y = 0;
        expect(isInBoundsForTileZoomXY(z, 0, y)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(z, -1, y)).toBeFalsy();
        expect(isInBoundsForTileZoomXY(z, 3, y)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(z, 4, y)).toBeFalsy();
    });

    test('at Y bounds', () => {
        const z = 2, x = 0;
        expect(isInBoundsForTileZoomXY(z, x, 0)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(z, x, -1)).toBeFalsy();
        expect(isInBoundsForTileZoomXY(z, x, 3)).toBeTruthy();
        expect(isInBoundsForTileZoomXY(z, x, 4)).toBeFalsy();
    });

});

describe('isInBoundsForZoomLngLat', () => {

    test('at zoom bounds', () => {
        const lnglat = new LngLat(0, 0);
        expect(isInBoundsForZoomLngLat(MIN_TILE_ZOOM, lnglat, mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(MIN_TILE_ZOOM - 1, lnglat, mercatorWorldCoordinates)).toBeFalsy();
        expect(isInBoundsForZoomLngLat(MAX_TILE_ZOOM, lnglat, mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(MAX_TILE_ZOOM + 1, lnglat, mercatorWorldCoordinates)).toBeFalsy();
    });

    test('at longitude bounds', () => {
        const z = 0, lat = 0;
        expect(isInBoundsForZoomLngLat(z, new LngLat(-180, lat), mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(-181, lat), mercatorWorldCoordinates)).toBeFalsy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(179, lat), mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(180, lat), mercatorWorldCoordinates)).toBeFalsy();
    });

    test('at latitude bounds', () => {
        const z = 0, lng = 0;
        expect(isInBoundsForZoomLngLat(z, new LngLat(lng, 85.05), mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(lng, 85.06), mercatorWorldCoordinates)).toBeFalsy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(lng, -85.05), mercatorWorldCoordinates)).toBeTruthy();
        expect(isInBoundsForZoomLngLat(z, new LngLat(lng, -85.06), mercatorWorldCoordinates)).toBeFalsy();
    });

});

describe('isInBoundsForZoomLngLat with a non-cylindrical world coordinate helper', () => {
    test('follows the helper, not mercator', () => {
        const rotatedWorldCoordinates = new PlanarProjection(createRotatedCrs()).worldCoordinateHelper;
        // Beyond the mercator poles but inside the rotated world square.
        expect(isInBoundsForZoomLngLat(3, new LngLat(0, 89), mercatorWorldCoordinates)).toBe(false);
        expect(isInBoundsForZoomLngLat(3, new LngLat(0, 89), rotatedWorldCoordinates)).toBe(true);
        // Inside the mercator world but outside the rotated world square.
        expect(isInBoundsForZoomLngLat(3, new LngLat(-179, 84), mercatorWorldCoordinates)).toBe(true);
        expect(isInBoundsForZoomLngLat(3, new LngLat(-179, 84), rotatedWorldCoordinates)).toBe(false);
    });
});
