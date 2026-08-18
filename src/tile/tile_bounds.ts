import {LngLatBounds, type LngLatBoundsLike} from '../geo/lng_lat_bounds.ts';
import {mercatorWorldCoordinates, type WorldCoordinateHelper} from '../geo/projection/world_coordinate_helper.ts';

import type {CanonicalTileID} from './tile_id.ts';

export class TileBounds {
    bounds: LngLatBounds;
    minzoom: number;
    maxzoom: number;
    private _worldCoordinateHelper: WorldCoordinateHelper;

    constructor(bounds: [number, number, number, number], minzoom?: number | null, maxzoom?: number | null, worldCoordinateHelper: WorldCoordinateHelper = mercatorWorldCoordinates) {
        this.bounds = LngLatBounds.convert(this.validateBounds(bounds));
        this.minzoom = minzoom || 0;
        this.maxzoom = maxzoom || 24;
        this._worldCoordinateHelper = worldCoordinateHelper;
    }

    validateBounds(bounds: [number, number, number, number]): LngLatBoundsLike {
        // make sure the bounds property contains valid longitude and latitudes
        if (!Array.isArray(bounds) || bounds.length !== 4) return [-180, -90, 180, 90];
        return [Math.max(-180, bounds[0]), Math.max(-90, bounds[1]), Math.min(180, bounds[2]), Math.min(90, bounds[3])];
    }

    contains(tileID: CanonicalTileID): boolean {
        const wc = this._worldCoordinateHelper;
        const worldSize = Math.pow(2, tileID.z);
        const level = {
            minX: Math.floor(wc.worldXfromLng(this.bounds.getWest()) * worldSize),
            minY: Math.floor(wc.worldYfromLat(this.bounds.getNorth()) * worldSize),
            maxX: Math.ceil(wc.worldXfromLng(this.bounds.getEast()) * worldSize),
            maxY: Math.ceil(wc.worldYfromLat(this.bounds.getSouth()) * worldSize)
        };
        return tileID.x >= level.minX && tileID.x < level.maxX && tileID.y >= level.minY && tileID.y < level.maxY;
    }
}
