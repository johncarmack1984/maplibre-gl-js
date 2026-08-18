import {describe, test, expect} from 'vitest';
import {mercatorWorldCoordinates} from './world_coordinate_helper.ts';
import {mercatorXfromLng, mercatorYfromLat, lngFromMercatorX, latFromMercatorY} from '../mercator_coordinate.ts';
import {TileBounds} from '../../tile/tile_bounds.ts';
import {tileIdToLngLatBounds} from '../../tile/tile_id_to_lng_lat_bounds.ts';
import {isInBoundsForZoomLngLat} from '../../util/world_bounds.ts';
import {CanonicalTileID} from '../../tile/tile_id.ts';
import {LngLat} from '../lng_lat.ts';
import {MercatorProjection} from './mercator_projection.ts';
import {GlobeProjection} from './globe_projection.ts';
import {VerticalPerspectiveProjection} from './vertical_perspective_projection.ts';

describe('mercatorWorldCoordinates', () => {
    test('delegates to existing mercator functions', () => {
        expect(mercatorWorldCoordinates.worldXfromLng(0)).toBe(mercatorXfromLng(0));
        expect(mercatorWorldCoordinates.worldYfromLat(0)).toBe(mercatorYfromLat(0));
        expect(mercatorWorldCoordinates.lngFromWorldX(0.5)).toBe(lngFromMercatorX(0.5));
        expect(mercatorWorldCoordinates.latFromWorldY(0.5)).toBe(latFromMercatorY(0.5));
    });

    test('round-trip lng through world X', () => {
        for (const lng of [-180, -90, 0, 45, 90, 179.999]) {
            const x = mercatorWorldCoordinates.worldXfromLng(lng);
            expect(mercatorWorldCoordinates.lngFromWorldX(x)).toBeCloseTo(lng, 10);
        }
    });

    test('round-trip lat through world Y', () => {
        for (const lat of [-85, -45, 0, 45, 85]) {
            const y = mercatorWorldCoordinates.worldYfromLat(lat);
            expect(mercatorWorldCoordinates.latFromWorldY(y)).toBeCloseTo(lat, 10);
        }
    });

    test('world coordinate range', () => {
        expect(mercatorWorldCoordinates.worldXfromLng(-180)).toBeCloseTo(0, 10);
        expect(mercatorWorldCoordinates.worldXfromLng(180)).toBeCloseTo(1, 10);
        expect(mercatorWorldCoordinates.worldYfromLat(0)).toBeCloseTo(0.5, 10);
    });
});

describe('Projection.worldCoordinateHelper', () => {
    test('MercatorProjection returns mercatorWorldCoordinates', () => {
        const proj = new MercatorProjection();
        expect(proj.worldCoordinateHelper).toBe(mercatorWorldCoordinates);
    });

    test('VerticalPerspectiveProjection returns mercatorWorldCoordinates', () => {
        const proj = new VerticalPerspectiveProjection();
        expect(proj.worldCoordinateHelper).toBe(mercatorWorldCoordinates);
    });

    test('GlobeProjection returns mercatorWorldCoordinates', () => {
        const proj = new GlobeProjection({type: 'globe'}, {});
        expect(proj.worldCoordinateHelper).toBe(mercatorWorldCoordinates);
    });
});

describe('Projection.isPlanar', () => {
    test('MercatorProjection is planar', () => {
        expect(new MercatorProjection().isPlanar).toBe(true);
    });

    test('VerticalPerspectiveProjection is not planar', () => {
        expect(new VerticalPerspectiveProjection().isPlanar).toBe(false);
    });

    test('GlobeProjection is not planar', () => {
        expect(new GlobeProjection({type: 'globe'}, {}).isPlanar).toBe(false);
    });
});

describe('TileBounds with explicit WorldCoordinateHelper', () => {
    test('explicit mercator helper matches default', () => {
        const bounds: [number, number, number, number] = [-10, -10, 10, 10];
        const defaultBounds = new TileBounds(bounds);
        const explicitBounds = new TileBounds(bounds, null, null, mercatorWorldCoordinates);

        const tile = new CanonicalTileID(2, 2, 2);
        expect(explicitBounds.contains(tile)).toBe(defaultBounds.contains(tile));
    });
});

describe('tileIdToLngLatBounds with explicit WorldCoordinateHelper', () => {
    test('explicit mercator helper matches default', () => {
        const tile = new CanonicalTileID(1, 1, 1);
        const defaultResult = tileIdToLngLatBounds(tile);
        const explicitResult = tileIdToLngLatBounds(tile, 0, mercatorWorldCoordinates);

        expect(explicitResult.getWest()).toBeCloseTo(defaultResult.getWest(), 10);
        expect(explicitResult.getEast()).toBeCloseTo(defaultResult.getEast(), 10);
        expect(explicitResult.getSouth()).toBeCloseTo(defaultResult.getSouth(), 10);
        expect(explicitResult.getNorth()).toBeCloseTo(defaultResult.getNorth(), 10);
    });
});

describe('isInBoundsForZoomLngLat with explicit WorldCoordinateHelper', () => {
    test('explicit mercator helper matches default', () => {
        const lnglat = new LngLat(10, 20);
        expect(isInBoundsForZoomLngLat(5, lnglat, mercatorWorldCoordinates)).toBe(isInBoundsForZoomLngLat(5, lnglat));
    });
});
