import {describe, test, expect} from 'vitest';
import {PlanarProjection, crsWorldCoordinateHelper, simpleCrs, type CrsDefinition} from './planar_projection.ts';
import {MercatorProjection, MercatorShaderVariantKey} from './mercator_projection.ts';
import {mercatorWorldCoordinateHelper} from '../mercator_coordinate.ts';
import {LngLat, earthRadius} from '../lng_lat.ts';

function createSamplePoints(): Array<[number, number]> {
    return [
        [0, 0],
        [-89, -89],
        [89, 89],
        [12.5, 41.9],
        [-73.98, 40.75],
        [174.77, -41.29],
    ];
}

/**
 * A synthetic CRS whose axes both depend on lng and lat: lng/lat rotated by 30 degrees,
 * laid out in degrees, with tile 0/0/0 spanning -150..150 on each rotated axis.
 */
function createRotatedCrs(): CrsDefinition {
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    return {
        name: 'rotated-test',
        project(lng, lat) {
            return [lng * cos - lat * sin, lng * sin + lat * cos];
        },
        unproject(x, y) {
            return [x * cos + y * sin, -x * sin + y * cos];
        },
        tileMatrix: {origin: [-150, 150], extentAtZoom0: 300},
    };
}

/**
 * Spherical mercator written as a CRS definition, so its world coordinates can be checked against
 * the mercator helper's own math.
 */
function createMercatorAsCrs(): CrsDefinition {
    const halfCircumference = Math.PI * earthRadius;
    return {
        name: 'mercator-as-crs',
        project(lng, lat) {
            const phi = lat * Math.PI / 180;
            return [lng * Math.PI / 180 * earthRadius, earthRadius * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
        },
        unproject(x, y) {
            return [x / earthRadius * 180 / Math.PI, (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * 180 / Math.PI];
        },
        tileMatrix: {origin: [-halfCircumference, halfCircumference], extentAtZoom0: 2 * halfCircumference},
    };
}

describe('PlanarProjection', () => {
    test('takes its name from the definition and is planar', () => {
        const projection = new PlanarProjection(createRotatedCrs());
        expect(projection.name).toBe('rotated-test');
        expect(projection.isPlanar).toBe(true);
    });

    test('shares the mercator shader variant', () => {
        const projection = new PlanarProjection(simpleCrs);
        const mercator = new MercatorProjection();
        expect(projection.shaderVariantName).toBe(MercatorShaderVariantKey);
        expect(projection.shaderDefine).toBe(mercator.shaderDefine);
        expect(projection.shaderPreludeCode).toBe(mercator.shaderPreludeCode);
        expect(projection.useSubdivision).toBe(false);
    });
});

describe('crsWorldCoordinateHelper', () => {
    describe('simple', () => {
        test('maps the tile 0 square to lng/lat -90..90', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(simpleCrs);
            expect(worldCoordinateHelper.worldFromLngLat(-90, 90)).toMatchObject({x: 0, y: 0});
            expect(worldCoordinateHelper.worldFromLngLat(90, -90)).toMatchObject({x: 1, y: 1});
            expect(worldCoordinateHelper.worldFromLngLat(0, 0)).toMatchObject({x: 0.5, y: 0.5});
            expect(worldCoordinateHelper.worldFromLngLat(45, 45)).toMatchObject({x: 0.75, y: 0.25});
        });

        test('round trips lng/lat through world coordinates', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(simpleCrs);
            for (const [lng, lat] of createSamplePoints()) {
                const world = worldCoordinateHelper.worldFromLngLat(lng, lat);
                const back = worldCoordinateHelper.lngLatFromWorld(world.x, world.y);
                expect(back).toBeInstanceOf(LngLat);
                expect(back.lng).toBeCloseTo(lng, 12);
                expect(back.lat).toBeCloseTo(lat, 12);
            }
        });

        test('uses a constant meters per world unit equal to the zoom 0 extent', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(simpleCrs);
            expect(worldCoordinateHelper.metersPerWorldUnit(0.5, 0.5)).toBe(180);
            expect(worldCoordinateHelper.metersPerWorldUnit(0.95, 0.05)).toBe(180);
            expect(worldCoordinateHelper.worldZFromAltitude(360, new LngLat(80, 80))).toBe(2);
        });

        test('puts the altitude in z and leaves z at 0 without one', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(simpleCrs);
            expect(worldCoordinateHelper.worldFromLngLat(0, 0).z).toBe(0);
            expect(worldCoordinateHelper.worldFromLngLat(0, 0, 90).z).toBe(0.5);
        });

        test('does not wrap', () => {
            expect(crsWorldCoordinateHelper(simpleCrs).wraps).toBe(false);
        });
    });

    describe('rotated CRS', () => {
        test('round trips lng/lat through world coordinates', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(createRotatedCrs());
            for (const [lng, lat] of createSamplePoints()) {
                const world = worldCoordinateHelper.worldFromLngLat(lng, lat);
                const back = worldCoordinateHelper.lngLatFromWorld(world.x, world.y);
                expect(back.lng).toBeCloseTo(lng, 10);
                expect(back.lat).toBeCloseTo(lat, 10);
            }
        });

        test('measures world coordinates from the tile matrix origin with y growing down', () => {
            const definition = createRotatedCrs();
            const worldCoordinateHelper = crsWorldCoordinateHelper(definition);
            // World (0.25, 0.75) is a quarter of the extent right of the origin and three quarters below it.
            const lngLat = worldCoordinateHelper.lngLatFromWorld(0.25, 0.75);
            const [x, y] = definition.project(lngLat.lng, lngLat.lat);
            expect(x).toBeCloseTo(-150 + 0.25 * 300, 10);
            expect(y).toBeCloseTo(150 - 0.75 * 300, 10);
        });

        test('takes the zoom 0 extent as meters per world unit', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(createRotatedCrs());
            expect(worldCoordinateHelper.metersPerWorldUnit(0.5, 0.5)).toBe(300);
            expect(worldCoordinateHelper.worldZFromAltitude(300, new LngLat(0, 0))).toBe(1);
        });
    });

    describe('mercator written as a CRS', () => {
        test('matches the mercator helper in both directions and in meters per world unit', () => {
            const worldCoordinateHelper = crsWorldCoordinateHelper(createMercatorAsCrs());
            for (const [lng, lat] of [...createSamplePoints(), [-180, -85], [180, 85]]) {
                const expected = mercatorWorldCoordinateHelper.worldFromLngLat(lng, lat);
                const actual = worldCoordinateHelper.worldFromLngLat(lng, lat);
                expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-12);
                expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-12);
            }
            for (const [x, y] of [[0.5, 0.5], [0.1, 0.9], [0.999, 0.001], [0.25, 0.75]]) {
                const expected = mercatorWorldCoordinateHelper.lngLatFromWorld(x, y);
                const actual = worldCoordinateHelper.lngLatFromWorld(x, y);
                expect(actual.lng).toBeCloseTo(expected.lng, 10);
                expect(actual.lat).toBeCloseTo(expected.lat, 10);
            }
            expect(worldCoordinateHelper.metersPerWorldUnit(0.5, 0.5)).toBeCloseTo(mercatorWorldCoordinateHelper.metersPerWorldUnit(0.5, 0.5), 6);
        });
    });
});
