import type {WorldCoordinateHelper} from '../geo/transform_interface.ts';
import type {CRSDefinition} from '../geo/projection/crs.ts';
import type {TileMatrixSet} from '../geo/projection/tile_matrix_set.ts';
import type {GeoJSONSourceDiff} from '../source/geojson_source_diff.ts';

/**
 * A function mapping one GeoJSON position to another: the first two ordinates are the horizontal position, and any
 * further ones (altitude and beyond) are carried over as they are.
 */
type PositionMapper = (position: GeoJSON.Position) => GeoJSON.Position;

/**
 * @internal
 * Rewrites every position of a GeoJSON object from the data's coordinates to the map projection's world coordinates,
 * x and y from 0 to 1 across its world square with y growing down, which geojson-vt tiles with its `worldCoordinates`
 * option. `crs.projection` takes the data's positions to the projection's coordinates: from lng/lat, or unchanged for
 * data already in them.
 * Returns a new object; the input is never mutated, and non-coordinate members are carried over as they are.
 */
export function reprojectGeoJSONToWorld<T extends GeoJSON.GeoJSON>(data: T, crs: CRSDefinition): T {
    return mapPositions(data, ([dataX, dataY, ...rest]) => {
        const [x, y] = worldFromCRS(crs.tileMatrixSet, crs.projection.forward([dataX, dataY]));
        return [x, y, ...rest];
    });
}

/**
 * @internal
 * The inverse of {@link reprojectGeoJSONToWorld}: rewrites world coordinates (as returned by the worker for cluster
 * children and leaves) back to the data's coordinates. Returns a new object.
 */
export function reprojectGeoJSONFromWorld<T extends GeoJSON.GeoJSON>(data: T, crs: CRSDefinition): T {
    return mapPositions(data, ([x, y, ...rest]) => {
        const [dataX, dataY] = crs.projection.inverse(crsFromWorld(crs.tileMatrixSet, x, y));
        return [dataX, dataY, ...rest];
    });
}

/**
 * @internal
 * Rewrites a GeoJSON object in a registered projection's own coordinates to lng/lat: through the projection's world
 * square and the map's world coordinate helper, which also answers for positions outside the tile matrix set.
 * Returns a new object.
 */
export function reprojectGeoJSONFromCRSToLngLat<T extends GeoJSON.GeoJSON>(data: T, tileMatrixSet: TileMatrixSet, worldCoordinateHelper: WorldCoordinateHelper): T {
    return mapPositions(data, ([crsX, crsY, ...rest]) => {
        const lngLat = worldCoordinateHelper.lngLatFromWorld(...worldFromCRS(tileMatrixSet, [crsX, crsY]));
        return [lngLat.lng, lngLat.lat, ...rest];
    });
}

/**
 * @internal
 * Rewrites the geometries a diff adds or replaces, as {@link reprojectGeoJSONToWorld} does for whole data.
 * Returns a new diff; removals and property changes are carried over as they are.
 */
export function reprojectGeoJSONSourceDiffToWorld(diff: GeoJSONSourceDiff, crs: CRSDefinition): GeoJSONSourceDiff {
    const reprojected = {...diff};
    if (diff.add) {
        reprojected.add = diff.add.map(feature => reprojectGeoJSONToWorld(feature, crs));
    }
    if (diff.update) {
        reprojected.update = diff.update.map(update => update.newGeometry ?
            {...update, newGeometry: reprojectGeoJSONToWorld(update.newGeometry, crs)} :
            update);
    }
    return reprojected;
}

/**
 * World coordinates of a position in a tile matrix set's CRS coordinates: tile 0/0/0 is the 0..1 square, y grows down.
 */
function worldFromCRS(tileMatrixSet: TileMatrixSet, [crsX, crsY]: number[]): [number, number] {
    const [originX, originY] = tileMatrixSet.origin;
    return [(crsX - originX) / tileMatrixSet.extentAtZoom0, (originY - crsY) / tileMatrixSet.extentAtZoom0];
}

/**
 * The inverse of {@link worldFromCRS}.
 */
function crsFromWorld(tileMatrixSet: TileMatrixSet, x: number, y: number): [number, number] {
    const [originX, originY] = tileMatrixSet.origin;
    return [originX + x * tileMatrixSet.extentAtZoom0, originY - y * tileMatrixSet.extentAtZoom0];
}

function mapPositions<T extends GeoJSON.GeoJSON>(data: T, mapper: PositionMapper): T {
    if (!data || typeof data !== 'object') return data;
    switch (data.type) {
        case 'FeatureCollection':
            return {...data, features: data.features.map(feature => mapPositions(feature, mapper))};
        case 'Feature':
            return {...data, geometry: data.geometry ? mapPositions(data.geometry, mapper) : data.geometry};
        case 'GeometryCollection':
            return {...data, geometries: data.geometries.map(geometry => mapPositions(geometry, mapper))};
        case 'Point':
            return {...data, coordinates: mapper(data.coordinates)};
        case 'MultiPoint':
        case 'LineString':
            return {...data, coordinates: data.coordinates.map(mapper)};
        case 'MultiLineString':
        case 'Polygon':
            return {...data, coordinates: data.coordinates.map(line => line.map(mapper))};
        case 'MultiPolygon':
            return {...data, coordinates: data.coordinates.map(polygon => polygon.map(ring => ring.map(mapper)))};
        default:
            return data;
    }
}
