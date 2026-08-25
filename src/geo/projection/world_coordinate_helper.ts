import {LngLat} from '../lng_lat.ts';
import {earthCircumference, latFromMercatorY, lngFromMercatorX, mercatorScale, mercatorXfromLng, mercatorYfromLat, mercatorZfromAltitude} from '../mercator_coordinate.ts';

/**
 * @internal
 * Maps between geographic coordinates and the 0..1 world square that the tile
 * quad-tree subdivides. Transform and camera code goes through this seam instead of
 * calling the mercator functions directly, so a projection with a different planar
 * mapping can supply its own without touching the callers.
 *
 * The mapping does not have to be separable: `x` may depend on both `lng` and `lat`
 * and vice versa.
 */
export type WorldCoordinateHelper = {
    /**
     * lng/lat in degrees to world square coordinates.
     */
    worldFromLngLat(lng: number, lat: number): {x: number; y: number};
    /**
     * World square coordinates to lng/lat.
     */
    lngLatFromWorld(x: number, y: number): LngLat;
    /**
     * Meters per world unit at a location (mercator: the circumference at that latitude; planar: constant, argument ignored).
     * Takes the location rather than a world position so mercator never round-trips y to latitude.
     */
    metersPerWorldUnit(lngLat: LngLat): number;
    /**
     * Altitude in meters to world z at a location (mercator: `mercatorZfromAltitude(altitude, lat)`; planar: constant scale, argument ignored).
     */
    worldZFromAltitude(altitude: number, lngLat: LngLat): number;
    /**
     * lng/lat bounds `[west, south, east, north]` the camera is constrained to when no `maxBounds`
     * are set. Mercator: `null`, which keeps the longitude wrap plus the `MAX_VALID_LATITUDE` clamp.
     */
    defaultLngLatBounds: [number, number, number, number] | null;
    /**
     * True for mercator only. Drives world copies, longitude wrapping, and the pole/horizon handling.
     */
    wraps: boolean;
};

/**
 * @internal
 * The Web Mercator world mapping used by the mercator, globe, and vertical-perspective projections.
 * `metersPerWorldUnit` is the inverse of `MercatorCoordinate.meterInMercatorCoordinateUnits`, written the
 * same way so the camera-to-center iteration produces the same doubles it did when it called that method.
 */
export const mercatorWorldCoordinates: WorldCoordinateHelper = {
    worldFromLngLat(lng: number, lat: number): {x: number; y: number} {
        return {x: mercatorXfromLng(lng), y: mercatorYfromLat(lat)};
    },
    lngLatFromWorld(x: number, y: number): LngLat {
        return new LngLat(lngFromMercatorX(x), latFromMercatorY(y));
    },
    metersPerWorldUnit(lngLat: LngLat): number {
        return 1 / (1 / earthCircumference * mercatorScale(lngLat.lat));
    },
    worldZFromAltitude(altitude: number, lngLat: LngLat): number {
        return mercatorZfromAltitude(altitude, lngLat.lat);
    },
    defaultLngLatBounds: null,
    wraps: true,
};

/**
 * @internal
 * Projects the four corners of a lng/lat box and returns the world rectangle that contains them.
 * For a cylindrical mapping like mercator this is exactly the projected box; for a mapping where
 * `x` and `y` both depend on `lng` and `lat` it is the axis-aligned hull of the corners, which is
 * correct for axis-aligned lng/lat boxes up to the curvature of the box edges.
 */
export function lngLatBoxToWorldBox(helper: WorldCoordinateHelper, west: number, south: number, east: number, north: number): {minX: number; minY: number; maxX: number; maxY: number} {
    const corners = [
        helper.worldFromLngLat(west, north),
        helper.worldFromLngLat(east, north),
        helper.worldFromLngLat(east, south),
        helper.worldFromLngLat(west, south),
    ];
    return {
        minX: Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x),
        minY: Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y),
        maxX: Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x),
        maxY: Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y),
    };
}

/**
 * @internal
 * Maps the four corners of a world rectangle back to lng/lat and returns the box that contains them.
 */
export function worldBoxToLngLatBox(helper: WorldCoordinateHelper, minX: number, minY: number, maxX: number, maxY: number): {west: number; south: number; east: number; north: number} {
    const corners = [
        helper.lngLatFromWorld(minX, minY),
        helper.lngLatFromWorld(maxX, minY),
        helper.lngLatFromWorld(maxX, maxY),
        helper.lngLatFromWorld(minX, maxY),
    ];
    return {
        west: Math.min(corners[0].lng, corners[1].lng, corners[2].lng, corners[3].lng),
        south: Math.min(corners[0].lat, corners[1].lat, corners[2].lat, corners[3].lat),
        east: Math.max(corners[0].lng, corners[1].lng, corners[2].lng, corners[3].lng),
        north: Math.max(corners[0].lat, corners[1].lat, corners[2].lat, corners[3].lat),
    };
}
