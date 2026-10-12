import {describe, expect, test} from 'vitest';
import {reprojectGeoJSONFromCRSToLngLat, reprojectGeoJSONFromWorld, reprojectGeoJSONSourceDiffToWorld, reprojectGeoJSONToWorld} from './geojson_reproject.ts';
import {CRSWorldCoordinateHelper, identityCrs, type CRSDefinition} from '../geo/projection/crs.ts';

import type {GeoJSONSourceDiff} from '../source/geojson_source_diff.ts';

/** A projection whose coordinates are lng/lat times ten, on a grid square from -1000 to 1000 on both axes. */
const timesTenCrs: CRSDefinition = {
    name: 'EPSG:test',
    projection: {forward: ([lng, lat]) => [lng * 10, lat * 10], inverse: ([x, y]) => [x / 10, y / 10]},
    tileMatrixSet: {origin: [-1000, 1000], extentAtZoom0: 2000}
};

/** Data already in the coordinates of {@link timesTenCrs}, so it needs no conversion. */
const inTimesTenCrs: CRSDefinition = {...timesTenCrs, projection: identityCrs.projection};

describe('reprojectGeoJSONToWorld', () => {
    test('moves an identity-CRS position to its world coordinates', () => {
        const point: GeoJSON.Point = {type: 'Point', coordinates: [45, 45]};
        expect(reprojectGeoJSONToWorld(point, identityCrs).coordinates).toEqual([0.75, 0.25]);
    });

    test('keeps the altitude and any further ordinates', () => {
        const point: GeoJSON.Point = {type: 'Point', coordinates: [0, 0, 123, 4]};
        expect(reprojectGeoJSONToWorld(point, identityCrs).coordinates).toEqual([0.5, 0.5, 123, 4]);
    });

    test('walks features, collections, nested geometries and geometry collections without mutating the input', () => {
        const data: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                id: 'a',
                properties: {name: 'a'},
                geometry: {type: 'Polygon', coordinates: [[[0, 0], [45, 0], [45, 45], [0, 45], [0, 0]]]}
            }, {
                type: 'Feature',
                properties: null,
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [
                        {type: 'MultiLineString', coordinates: [[[0, 0], [45, 45]]]},
                        {type: 'Point', coordinates: [45, 0]}
                    ]
                }
            }, {
                type: 'Feature',
                properties: {},
                geometry: null
            }]
        };
        const copy = JSON.parse(JSON.stringify(data));

        const result = reprojectGeoJSONToWorld(data, identityCrs);

        expect(data).toEqual(copy);
        expect(result).not.toBe(data);
        expect(result.features[0].id).toBe('a');
        expect(result.features[0].properties).toBe(data.features[0].properties);
        expect(result.features[2].geometry).toBeNull();
        const polygon = result.features[0].geometry as GeoJSON.Polygon;
        expect(polygon.coordinates[0][2]).toEqual([0.75, 0.25]);
        const collection = result.features[1].geometry as GeoJSON.GeometryCollection;
        expect((collection.geometries[1] as GeoJSON.Point).coordinates).toEqual([0.75, 0.5]);
    });
});

describe('reprojectGeoJSONToWorld for data in the projection\'s own coordinates', () => {
    test('places a position by the tile matrix set alone', () => {
        const point: GeoJSON.Point = {type: 'Point', coordinates: [500, 500]};
        expect(reprojectGeoJSONToWorld(point, inTimesTenCrs).coordinates).toEqual([0.75, 0.25]);
    });
});

describe('reprojectGeoJSONFromWorld', () => {
    test('round trips with reprojectGeoJSONToWorld, 3D coordinates and geometry collections included', () => {
        const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'GeometryCollection',
                geometries: [
                    {type: 'Point', coordinates: [-30, -30, 500]},
                    {type: 'MultiPolygon', coordinates: [[[[0, 0, 1], [45, 0, 2], [45, 45, 3], [0, 0, 1]]]]}
                ]
            }
        };
        const roundTripped = reprojectGeoJSONFromWorld(reprojectGeoJSONToWorld(feature, identityCrs), identityCrs);
        const geometries = (roundTripped.geometry as GeoJSON.GeometryCollection).geometries;
        expect((geometries[0] as GeoJSON.Point).coordinates).toEqual([expect.closeTo(-30, 9), expect.closeTo(-30, 9), 500]);
        expect((geometries[1] as GeoJSON.MultiPolygon).coordinates).toEqual([[[
            [expect.closeTo(0, 9), expect.closeTo(0, 9), 1],
            [expect.closeTo(45, 9), expect.closeTo(0, 9), 2],
            [expect.closeTo(45, 9), expect.closeTo(45, 9), 3],
            [expect.closeTo(0, 9), expect.closeTo(0, 9), 1]
        ]]]);
    });
});

describe('reprojectGeoJSONFromWorld for data in the projection\'s own coordinates', () => {
    test('round trips a position far outside the lng/lat range', () => {
        const point: GeoJSON.Point = {type: 'Point', coordinates: [500, 500]};
        const roundTripped = reprojectGeoJSONFromWorld(reprojectGeoJSONToWorld(point, inTimesTenCrs), inTimesTenCrs);
        expect(roundTripped.coordinates).toEqual([expect.closeTo(500, 9), expect.closeTo(500, 9)]);
    });
});

describe('reprojectGeoJSONFromCRSToLngLat', () => {
    test('moves a position in the projection\'s coordinates to the lng/lat the map\'s world coordinate helper gives it', () => {
        const point: GeoJSON.Point = {type: 'Point', coordinates: [450, 450, 7]};
        const lngLatPoint = reprojectGeoJSONFromCRSToLngLat(point, timesTenCrs.tileMatrixSet, new CRSWorldCoordinateHelper(timesTenCrs));
        expect(lngLatPoint.coordinates).toEqual([expect.closeTo(45, 9), expect.closeTo(45, 9), 7]);
    });
});

describe('reprojectGeoJSONSourceDiffToWorld', () => {
    test('moves the added features and the replaced geometries, and keeps removals and property changes', () => {
        const diff = {
            remove: ['gone'],
            add: [{type: 'Feature', id: 'new', properties: {}, geometry: {type: 'Point', coordinates: [45, 45]}}],
            update: [
                {id: 'moved', newGeometry: {type: 'Point', coordinates: [45, 45]}},
                {id: 'renamed', addOrUpdateProperties: [{key: 'name', value: 'b'}]}
            ]
        } satisfies GeoJSONSourceDiff;

        const result = reprojectGeoJSONSourceDiffToWorld(diff, identityCrs);

        expect(result.remove).toEqual(['gone']);
        expect((result.add[0].geometry as GeoJSON.Point).coordinates).toEqual([0.75, 0.25]);
        expect((result.update[0].newGeometry as GeoJSON.Point).coordinates).toEqual([0.75, 0.25]);
        expect(result.update[1]).toBe(diff.update[1]);
    });
});
