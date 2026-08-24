import {LngLat} from '../lng_lat.ts';
import {MercatorProjection} from './mercator_projection.ts';
import type {ProjectionSpecification} from '@maplibre/maplibre-gl-style-spec';
import type {WorldCoordinateHelper} from './world_coordinate_helper.ts';
import type {TileMatrix} from './tile_matrix.ts';

/**
 * Describes a planar coordinate reference system (CRS) together with the square, power-of-two
 * quad tile grid laid over it, so a map can render tiles that were pre-projected in that CRS.
 * Register a definition with {@link addProjection} and select it with `map.setProjection({type: name})`
 * or the style's `projection.type`.
 *
 * Tiles are used as-is: the map never reprojects tile content, it only positions the CRS's own
 * tile grid on screen and maps lng/lat to and from it through `project`/`unproject`.
 *
 * @group Geography and Geometry
 */
export type CrsDefinition = {
    /**
     * Name used in `projection.type`, e.g. `'EPSG:2193'`.
     * `'simple'` is pre-registered; `'mercator'`, `'globe'` and `'vertical-perspective'` are reserved.
     */
    name: string;
    /**
     * lng/lat (degrees) to CRS coordinates (e.g. meters easting/northing).
     */
    project(lng: number, lat: number): [number, number];
    /**
     * CRS coordinates to `[lng, lat]`.
     */
    unproject(x: number, y: number): [number, number];
    /**
     * The quad tile matrix set over the CRS plane.
     */
    tileMatrix: TileMatrix;
    /**
     * CRS units to meters. Default 1. Converts altitudes and elevations given in meters to world units and
     * the camera distance to a zoom level, so a CRS in feet or degrees still takes meters at its API.
     */
    metersPerUnit?: number;
    /**
     * Optional lng/lat bounds `[west, south, east, north]` used to constrain the camera. They become the
     * map's default max bounds: `getMaxBounds()` reports them and `setMaxBounds(null)` returns to them.
     * Default: the tile 0/0/0 square.
     */
    bounds?: [number, number, number, number];
};

/**
 * Builds the world-coordinate mapping for a CRS definition: world x/y are the CRS coordinates
 * relative to the tile matrix origin, scaled so tile 0/0/0 is the 0..1 square, with y growing down.
 */
function crsWorldCoordinates(def: CrsDefinition): WorldCoordinateHelper {
    const [originX, originY] = def.tileMatrix.origin;
    const extent = def.tileMatrix.extentAtZoom0;
    const metersPerWorldUnit = extent * (def.metersPerUnit ?? 1);
    return {
        worldFromLngLat(lng: number, lat: number): {x: number; y: number} {
            const [crsX, crsY] = def.project(lng, lat);
            return {x: (crsX - originX) / extent, y: (originY - crsY) / extent};
        },
        lngLatFromWorld(x: number, y: number): LngLat {
            const [lng, lat] = def.unproject(originX + x * extent, originY - y * extent);
            return new LngLat(lng, lat);
        },
        metersPerWorldUnit(): number {
            return metersPerWorldUnit;
        },
        worldZFromAltitude(altitude: number): number {
            return altitude / metersPerWorldUnit;
        },
        defaultLngLatBounds: def.bounds ?? null,
        wraps: false,
    };
}

/**
 * @internal
 * The identity CRS behind the built-in `'simple'` projection: CRS coordinates are lng/lat degrees and
 * tile 0/0/0 spans -90..90 on both axes. It exists for image-space maps (the analogue of Leaflet's
 * `CRS.Simple`), where a square root tile keeps the quad tree uniform in both directions.
 */
export const simpleCrs: CrsDefinition = {
    name: 'simple',
    project(lng: number, lat: number): [number, number] {
        return [lng, lat];
    },
    unproject(x: number, y: number): [number, number] {
        return [x, y];
    },
    tileMatrix: {
        origin: [-90, 90],
        extentAtZoom0: 180,
    },
};

/**
 * @internal
 * A flat projection over a registered planar CRS. Rendering is identical to mercator, since the
 * tiles are already in the CRS's own quad grid and only the lng/lat mapping differs; that mapping
 * comes from the CRS definition. Shares the mercator shader variant so programs are cached once
 * for every planar projection.
 */
export class PlanarProjection extends MercatorProjection {
    private readonly _name: string;
    private readonly _worldCoordinateHelper: WorldCoordinateHelper;
    private readonly _tileMatrix: TileMatrix;

    constructor(definition: CrsDefinition) {
        super();
        this._name = definition.name;
        this._worldCoordinateHelper = crsWorldCoordinates(definition);
        this._tileMatrix = definition.tileMatrix;
    }

    override get name(): ProjectionSpecification['type'] {
        return this._name;
    }

    override get worldCoordinateHelper(): WorldCoordinateHelper {
        return this._worldCoordinateHelper;
    }

    override get tileMatrix(): TileMatrix {
        return this._tileMatrix;
    }
}
