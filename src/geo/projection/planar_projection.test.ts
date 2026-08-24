import {describe, test, expect} from 'vitest';
import {PlanarProjection, simpleCrs, type CrsDefinition} from './planar_projection.ts';
import {MercatorProjection, MercatorShaderVariantKey} from './mercator_projection.ts';
import {mercatorWorldCoordinates} from './world_coordinate_helper.ts';
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
        metersPerUnit: 111_000,
        bounds: [-100, -80, 100, 80],
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

describe('PlanarProjection.worldCoordinateHelper', () => {
    describe('simple', () => {
        test('maps the tile 0 square to lng/lat -90..90', () => {
            const helper = new PlanarProjection(simpleCrs).worldCoordinateHelper;
            expect(helper.worldFromLngLat(-90, 90)).toEqual({x: 0, y: 0});
            expect(helper.worldFromLngLat(90, -90)).toEqual({x: 1, y: 1});
            expect(helper.worldFromLngLat(0, 0)).toEqual({x: 0.5, y: 0.5});
            expect(helper.worldFromLngLat(45, 45)).toEqual({x: 0.75, y: 0.25});
        });

        test('round trips lng/lat through world coordinates', () => {
            const helper = new PlanarProjection(simpleCrs).worldCoordinateHelper;
            for (const [lng, lat] of createSamplePoints()) {
                const world = helper.worldFromLngLat(lng, lat);
                const back = helper.lngLatFromWorld(world.x, world.y);
                expect(back).toBeInstanceOf(LngLat);
                expect(back.lng).toBeCloseTo(lng, 12);
                expect(back.lat).toBeCloseTo(lat, 12);
            }
        });

        test('uses a constant meters per world unit equal to the zoom 0 extent', () => {
            const helper = new PlanarProjection(simpleCrs).worldCoordinateHelper;
            expect(helper.metersPerWorldUnit(new LngLat(0, 0))).toBe(180);
            expect(helper.metersPerWorldUnit(new LngLat(80, 80))).toBe(180);
            expect(helper.worldZFromAltitude(360, new LngLat(80, 80))).toBe(2);
        });

        test('does not wrap and has no lng/lat bounds beyond the square', () => {
            const helper = new PlanarProjection(simpleCrs).worldCoordinateHelper;
            expect(helper.wraps).toBe(false);
            expect(helper.defaultLngLatBounds).toBeNull();
        });
    });

    describe('rotated CRS', () => {
        test('round trips lng/lat through world coordinates', () => {
            const helper = new PlanarProjection(createRotatedCrs()).worldCoordinateHelper;
            for (const [lng, lat] of createSamplePoints()) {
                const world = helper.worldFromLngLat(lng, lat);
                const back = helper.lngLatFromWorld(world.x, world.y);
                expect(back.lng).toBeCloseTo(lng, 10);
                expect(back.lat).toBeCloseTo(lat, 10);
            }
        });

        test('measures world coordinates from the tile matrix origin with y growing down', () => {
            const definition = createRotatedCrs();
            const helper = new PlanarProjection(definition).worldCoordinateHelper;
            // World (0.25, 0.75) is a quarter of the extent right of the origin and three quarters below it.
            const lngLat = helper.lngLatFromWorld(0.25, 0.75);
            const [x, y] = definition.project(lngLat.lng, lngLat.lat);
            expect(x).toBeCloseTo(-150 + 0.25 * 300, 10);
            expect(y).toBeCloseTo(150 - 0.75 * 300, 10);
        });

        test('scales meters by metersPerUnit times the zoom 0 extent', () => {
            const helper = new PlanarProjection(createRotatedCrs()).worldCoordinateHelper;
            expect(helper.metersPerWorldUnit(new LngLat(0, 0))).toBe(300 * 111_000);
            expect(helper.worldZFromAltitude(300 * 111_000, new LngLat(0, 0))).toBe(1);
        });

        test('exposes the definition bounds as the default camera bounds', () => {
            const helper = new PlanarProjection(createRotatedCrs()).worldCoordinateHelper;
            expect(helper.defaultLngLatBounds).toEqual([-100, -80, 100, 80]);
        });
    });

    describe('mercator written as a CRS', () => {
        test('matches the mercator helper in both directions and in meters per world unit', () => {
            const helper = new PlanarProjection(createMercatorAsCrs()).worldCoordinateHelper;
            for (const [lng, lat] of [...createSamplePoints(), [-180, -85], [180, 85]]) {
                const expected = mercatorWorldCoordinates.worldFromLngLat(lng, lat);
                const actual = helper.worldFromLngLat(lng, lat);
                expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-12);
                expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-12);
            }
            for (const [x, y] of [[0.5, 0.5], [0.1, 0.9], [0.999, 0.001], [0.25, 0.75]]) {
                const expected = mercatorWorldCoordinates.lngLatFromWorld(x, y);
                const actual = helper.lngLatFromWorld(x, y);
                expect(actual.lng).toBeCloseTo(expected.lng, 10);
                expect(actual.lat).toBeCloseTo(expected.lat, 10);
            }
            expect(helper.metersPerWorldUnit(new LngLat(0, 0))).toBeCloseTo(mercatorWorldCoordinates.metersPerWorldUnit(new LngLat(0, 0)), 6);
        });
    });
});
