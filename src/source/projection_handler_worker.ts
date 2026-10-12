import {identityCrs, type CRSDefinition} from '../geo/projection/crs.ts';
import {warnOnce} from '../util/util.ts';

/**
 * Builds the converter for a coordinate reference system from its WKT, the way `proj4(wkt)` does: `forward` takes
 * lng/lat to CRS coordinates and `inverse` takes them back. A worker script sets one with
 * `self.setProjectionHandler`, loaded through {@link importScriptInWorkers}, so that GeoJSON sources follow a
 * registered projection whose definition carries a `wkt`.
 */
export type ProjectionHandler = (wkt: string) => CRSDefinition['projection'];

let projectionHandler: ProjectionHandler | null = null;

/**
 * The converters the projection handler has built, by the string it built each from, so that data loaded again in the
 * same projection does not make it parse the string again.
 */
const projections = new Map<string, CRSDefinition['projection']>();

/**
 * @internal
 * Sets the worker's projection handler; a later call replaces it, and `null` removes it.
 */
export function setProjectionHandler(handler: ProjectionHandler | null): void {
    projectionHandler = handler;
    projections.clear();
}

/**
 * @internal
 * The definition a worker builds for a registered projection the main thread describes: with a WKT, the projection
 * handler builds the conversion from lng/lat; without one, the data is already in the projection's own coordinates
 * (the identity projection's lng/lat, or data whose `dataProjection` names the projection) and needs no conversion.
 * `undefined`, with a warning, when a WKT comes with no handler set.
 */
export function createWorkerCRS(crs: Pick<CRSDefinition, 'name' | 'wkt' | 'tileMatrixSet'>): CRSDefinition | undefined {
    if (!crs.wkt) return {name: crs.name, projection: identityCrs.projection, tileMatrixSet: crs.tileMatrixSet};
    if (!projectionHandler) {
        warnOnce('GeoJSON sources are drawn in the wrong place: no projection handler is set in the workers, see `setProjectionHandler` in the custom CRS guide.');
        return undefined;
    }
    if (!projections.has(crs.wkt)) projections.set(crs.wkt, projectionHandler(crs.wkt));
    return {name: crs.name, wkt: crs.wkt, projection: projections.get(crs.wkt), tileMatrixSet: crs.tileMatrixSet};
}
