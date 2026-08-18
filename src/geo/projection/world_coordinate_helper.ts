import {mercatorXfromLng, mercatorYfromLat, lngFromMercatorX, latFromMercatorY} from '../mercator_coordinate.ts';

/**
 * @internal
 * Maps between geographic coordinates and the 0..1 world square that the tile
 * quad-tree subdivides. Code that computes tile coverage or bounds should go
 * through this interface rather than calling the mercator functions directly,
 * so a projection with a different world mapping can supply its own.
 */
export interface WorldCoordinateHelper {
    worldXfromLng(lng: number): number;
    worldYfromLat(lat: number): number;
    lngFromWorldX(x: number): number;
    latFromWorldY(y: number): number;
}

/**
 * @internal
 * The Web Mercator world mapping used by the mercator, globe, and vertical-perspective projections.
 */
export const mercatorWorldCoordinates: WorldCoordinateHelper = {
    worldXfromLng: mercatorXfromLng,
    worldYfromLat: mercatorYfromLat,
    lngFromWorldX: lngFromMercatorX,
    latFromWorldY: latFromMercatorY,
};
