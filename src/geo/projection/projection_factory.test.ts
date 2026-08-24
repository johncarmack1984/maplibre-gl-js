import {afterEach, describe, test, expect} from 'vitest';
import {createProjectionFromName} from './projection_factory.ts';
import {addProjection, removeProjection} from './projection_crud.ts';
import {PlanarProjection} from './planar_projection.ts';
import {MercatorTransform} from './mercator_transform.ts';
import {MercatorCameraHelper} from './mercator_camera_helper.ts';
import {mercatorWorldCoordinates} from './world_coordinate_helper.ts';

afterEach(() => {
    removeProjection('factory-test-crs');
});

describe('createProjectionFromName', () => {
    test('gives the mercator transform the projection world coordinate helper', () => {
        const {projection, transform} = createProjectionFromName('mercator', undefined, {});
        expect(transform.worldCoordinateHelper).toBe(projection.worldCoordinateHelper);
        expect(transform.worldCoordinateHelper).toBe(mercatorWorldCoordinates);
    });

    test('gives the mercator fallback for an unknown name the same helper', () => {
        const {projection, transform} = createProjectionFromName('not-a-projection', undefined, {});
        expect(transform.worldCoordinateHelper).toBe(projection.worldCoordinateHelper);
        expect(transform.worldCoordinateHelper).toBe(mercatorWorldCoordinates);
    });

    test('resolves the built-in simple projection to a planar projection', () => {
        const {projection, transform, cameraHelper} = createProjectionFromName('simple', undefined, {});
        expect(projection).toBeInstanceOf(PlanarProjection);
        expect(projection.name).toBe('simple');
        expect(projection.isPlanar).toBe(true);
        expect(transform).toBeInstanceOf(MercatorTransform);
        expect(transform.worldCoordinateHelper).toBe(projection.worldCoordinateHelper);
        expect(transform.worldCoordinateHelper.wraps).toBe(false);
        expect(cameraHelper).toBeInstanceOf(MercatorCameraHelper);
    });

    test('resolves a registered name to a planar projection over its definition', () => {
        addProjection({
            name: 'factory-test-crs',
            project: (lng, lat) => [lng * 2, lat * 2],
            unproject: (x, y) => [x / 2, y / 2],
            tileMatrix: {origin: [-180, 180], extentAtZoom0: 360},
        });
        const {projection, transform} = createProjectionFromName('factory-test-crs', undefined, {});
        expect(projection).toBeInstanceOf(PlanarProjection);
        expect(projection.name).toBe('factory-test-crs');
        expect(transform.worldCoordinateHelper.worldFromLngLat(90, 90)).toEqual({x: 1, y: 0});
    });
});
