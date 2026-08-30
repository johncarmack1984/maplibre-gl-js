# Custom planar CRS internals

This is the internal counterpart to the [Custom Planar Coordinate Reference Systems](../docs/guides/custom-crs.md) user guide. It describes the seam that lets a `Map` render tiles in a planar CRS other than Web Mercator without touching the rendering pipeline.

## The seam: `WorldCoordinateHelper`

The transform, camera helper, covering tiles, sources, queries and terrain used to call `MercatorCoordinate.fromLngLat`, `mercatorXfromLng`, `mercatorZfromAltitude` and friends directly. Those calls now go through a `WorldCoordinateHelper` (`src/geo/transform_interface.ts`):

- `name` is `mercator`, or the name of the CRS registered with `addProjection`; the projection reports it as its own.
- `tileMatrix` is the quad grid laid over the world square; the `{bbox}` URL token expands through it.
- `worldFromLngLat(lng, lat, altitude?)` and `lngLatFromWorld(x, y)` map between lng/lat and world coordinates, the unit square that tile 0/0/0 covers and that the quad tree subdivides. `MercatorCoordinate` stays the container type for a world position; `z` is the altitude in world units, and stays `0` when no altitude is given so the hot paths skip the conversion.
- `metersPerWorldUnit(x, y)` is the local scale at a world position, used by the camera-to-center iteration and terrain skirts. Mercator returns the latitude-dependent value; a planar CRS returns a constant (`extentAtZoom0`, its units taken as meters) and ignores the arguments.
- `worldZFromAltitude(altitude, lngLat)` is the same idea for the vertical axis: an altitude in meters to world z. Mercator scales by the latitude of `lngLat`; a planar CRS uses its constant scale and ignores the argument.
- `wraps` is `true` only for mercator. It gates world copies, `LngLat.wrap()`, antimeridian handling, the `MAX_VALID_LATITUDE` clamp, terrain outside the world square and the hillshade latitude correction. With a non-wrapping helper `MercatorTransform._constrainToWorldSquare` clamps the camera to tile 0/0/0, or to the `maxBounds` box inside it, and the transform gets no default latitude range.

There are two implementations. `MercatorWorldCoordinateHelper` lives in `mercator_coordinate.ts` next to the mercator functions it calls and is exported as the single instance `mercatorWorldCoordinateHelper`; code that must know whether the worker's mercator math applies compares against that instance by identity (the GeoJSON source), everything else asks the helper. `CrsWorldCoordinateHelper` in `crs.ts` is built over a `CrsDefinition` and applies the world-coordinate formula from the user guide.

## Who owns the helper

The `Projection` does. `Projection.worldCoordinateHelper` is an `@internal` getter, and `MercatorProjection` is constructed over a helper, mercator's by default, and reads its `name` and `tileMatrix` off it. A registered CRS gets a `MercatorProjection` over that CRS's helper, so it shares the mercator shader variant, prelude, tile mesh and cached programs, and its tiles are drawn exactly as mercator tiles are: a tile's own coordinates are already in the CRS's quad grid, and only the lng/lat mapping around the edges differs. `GlobeProjection` delegates to its current half, and `VerticalPerspectiveProjection` returns mercator's, because the globe draws mercator tiles; a registered CRS is flat only.

The projection factory (`projection_factory.ts`) checks the registry populated by `addProjection` before its built-in switch. For a registered name it builds one `CrsWorldCoordinateHelper` and hands the same instance to the `MercatorProjection` and, through `setWorldCoordinateHelper`, to the `MercatorTransform`, which `clone()` carries along so symbol placement keeps the CRS. Readers take the shortest path to it: sources read `map.style.projection.worldCoordinateHelper` (as they read `subdivisionGranularity`), the style reads its own `projection`, queries and the camera read the transform they hold, and terrain reads `painter.transform.worldCoordinateHelper`. Nothing about the CRS lives on `Map`.

`Style._load` sets the projection before it adds the sources, because a source reads the helper as soon as it is added (a canvas source places its corners synchronously in `onAdd`).

## Why Mercator keeps its own functions

Mercator does not go through the generic CRS formula. Its helper calls the existing `mercatorXfromLng`/`mercatorYfromLat` functions with the same arguments the transform used before the seam existed, so every Mercator value is bit-for-bit identical to the previous code, and a unit test pins the transform's outputs against values captured before the refactor. When you touch a transform call site, feed the helper the same value the old code used (the camera's `center` both for camera math and for `worldZFromAltitude`) rather than a value that would need a round trip through lng/lat.

## GeoJSON: the pseudo-lng/lat trick

The worker tiles GeoJSON with `geojson-vt`, which projects with its own hard-coded Mercator. Rather than teach the worker about every CRS, `GeoJSONSource` pre-projects on the main thread when the map's helper is not mercator's: every position is moved to the lng/lat whose Mercator projection lands on the CRS's world position (`x * 360 - 180` for longitude and the inverse Mercator of `y` for latitude), so the worker's Mercator math puts the feature in the right tile. Query results are unprojected back through `lngLatFromWorld`, and cluster children and leaves are unprojected on receipt. Two consequences: a `data` URL is fetched on the main thread so the object can be rewritten, and the source's `filter` runs on pseudo coordinates in the worker, so geometry filters do not apply.

## Terrain and hillshade

Terrain reads the helper off `painter.transform`. The tile lookup for a location, the bounds check in `isInBoundsForZoomLngLat` (which takes the helper as a parameter) and the ray sampler `sampleAt` all go through it; `wraps` decides whether a location is wrapped with `LngLat.wrap()` first and whether `sampleAt` folds x into world copies, so a planar CRS has no terrain outside its world square. The skirt length is a fifth of the tile width in meters at the center of the world square, from the helper's `metersPerWorldUnit`: the equator for mercator, the constant for a CRS.

The hillshade shader scales slopes by `cos(lat)` to undo Mercator's latitude stretch, with the tile's latitude range passed as `u_latrange`. `getTileLatRange` returns `[0, 0]` for a helper that does not wrap, since only the cylindrical mercator plane stretches with latitude: `cos(0)` is 1, so a CRS in linear units gets no correction and the shader stays unchanged.

## Fence

Square, power-of-two quad tile grids only; one CRS per map; no world copies, no wrap, no globe transition. Anything beyond that, most of all reprojecting Mercator tile content, belongs to the [GPU reprojection discussion](https://github.com/maplibre/maplibre/issues/491).
