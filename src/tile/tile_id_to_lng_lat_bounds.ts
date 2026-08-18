import {LngLatBounds} from '../geo/lng_lat_bounds.ts';
import {mercatorWorldCoordinates, type WorldCoordinateHelper} from '../geo/projection/world_coordinate_helper.ts';
import type {CanonicalTileID} from './tile_id.ts';

export function tileIdToLngLatBounds(
    {x,y,z}: CanonicalTileID,
    buffer: number = 0,
    wc: WorldCoordinateHelper = mercatorWorldCoordinates,
): LngLatBounds {
    const lngMin = wc.lngFromWorldX((x - buffer) / Math.pow(2, z));
    const latMin = wc.latFromWorldY((y + 1 + buffer) / Math.pow(2, z));

    const lngMax = wc.lngFromWorldX((x + 1 + buffer) / Math.pow(2, z));
    const latMax = wc.latFromWorldY((y - buffer) / Math.pow(2, z));

    return new LngLatBounds([lngMin, latMin], [lngMax, latMax]);
}
