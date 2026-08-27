import {afterEach, beforeEach, describe, test, expect} from 'vitest';
import {createMap, beforeMapTest} from '../../util/test/util.ts';
import {addProjection, removeProjection} from '../../geo/projection/projection_crud.ts';

beforeEach(() => {
    beforeMapTest();
    global.fetch = null;
});

afterEach(() => {
    removeProjection('map-test-crs');
});

describe('Map with a registered planar CRS', () => {
    test('loads a style that declares the simple projection', async () => {
        const map = createMap({style: {version: 8, sources: {}, layers: [], projection: {type: 'simple'}}});
        await map.once('style.load');

        expect(map.getProjection()).toEqual({type: 'simple'});
        expect(map.style.projection.name).toBe('simple');
    });

    test('does not clamp the initial center to mercator latitudes before a planar style loads', async () => {
        const map = createMap({style: {version: 8, sources: {}, layers: [], projection: {type: 'simple'}}, center: [0, 89], zoom: 6});
        await map.once('style.load');

        expect(map.getCenter().lat).toBeCloseTo(89, 6);
    });

    test('setProjection switches to a CRS registered with addProjection', async () => {
        addProjection({
            name: 'map-test-crs',
            project: (lng, lat) => [lng, lat],
            unproject: (x, y) => [x, y],
            tileMatrix: {origin: [-180, 180], extentAtZoom0: 360},
        });
        const map = createMap();
        await map.once('style.load');

        map.setProjection({type: 'map-test-crs'});

        expect(map.style.projection.name).toBe('map-test-crs');
        // In this CRS lng/lat 90,90 is world (0.75, 0.25); at zoom 0 the 512px world is centered in the 200px container.
        const point = map.project([90, 90]);
        expect(point.x).toBeCloseTo(0.75 * 512 - 156, 6);
        expect(point.y).toBeCloseTo(0.25 * 512 - 156, 6);
    });

    test('returns to the CRS after a round trip through globe', async () => {
        const map = createMap();
        await map.once('style.load');

        map.setProjection({type: 'simple'});
        map.setProjection({type: 'globe'});
        expect(map.style.projection.name).toBe('globe');

        map.setProjection({type: 'simple'});
        expect(map.getProjection()).toEqual({type: 'simple'});
        expect(map.style.projection.name).toBe('simple');
    });

    test('constrains the center to the CRS square', async () => {
        const map = createMap({style: {version: 8, sources: {}, layers: [], projection: {type: 'simple'}}, zoom: 3});
        await map.once('style.load');

        map.setCenter([170, 0]);

        expect(map.getCenter().lng).toBeLessThanOrEqual(90);
    });
});
