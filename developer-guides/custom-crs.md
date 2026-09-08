# Custom planar CRS internals

This is the internal counterpart to the [Custom Planar Coordinate Reference Systems](../docs/guides/custom-crs.md) user guide. It describes the seam that lets a `Map` render tiles in a planar CRS other than Web Mercator without touching the rendering pipeline.

## The seam: `WorldCoordinateHelper`

The transform, camera, covering tiles, sources and queries used to call `MercatorCoordinate.fromLngLat`, `mercatorXfromLng`, `mercatorZfromAltitude` and friends directly. Those calls now go through a `WorldCoordinateHelper` owned by the transform (`transform.worldCoordinateHelper`, held by its `TransformHelper`; mercator unless the projection factory hands a registered CRS's mapping in through `TransformOptions.worldCoordinateHelper`):

- `worldFromLngLat(lng, lat, altitude?)` and `lngLatFromWorld(x, y)` map between lng/lat and world coordinates, the unit square that tile 0/0/0 covers and that the quad tree subdivides. `MercatorCoordinate` stays the container type for a world position; `z` is the altitude in world units, and stays `0` when no altitude is given so the hot paths skip the conversion.
- `metersPerWorldUnit(x, y)` is the local scale at a world position, used by the camera-to-center iteration and terrain skirts. Mercator returns the latitude-dependent value; a planar CRS returns a constant (`extentAtZoom0`, its units taken as meters) and ignores the arguments.
- `worldZFromAltitude(altitude, lngLat)` is the same idea for the vertical axis: an altitude in meters to world z. Mercator scales by the latitude of `lngLat`; a planar CRS uses its constant scale and ignores the argument.
- `wraps` is `true` only for Mercator. It gates world copies, `LngLat.wrap()`, antimeridian handling, the `MAX_VALID_LATITUDE` clamp and the hillshade latitude correction. With a non-wrapping helper `MercatorTransform._constrainToWorldSquare` clamps the camera to tile 0/0/0, or to the `maxBounds` box inside it, and the transform gets no default latitude range.

A `CrsDefinition` becomes a helper through `new CrsWorldCoordinateHelper(definition)`, which applies the world-coordinate formula from the user guide. The helper is not on `Projection`: everything that needs it holds a transform (sources reach it through `map._camera.transform`), and the projection built for a CRS is a `MercatorProjection` carrying only the CRS name and its tile matrix.

## `Projection.isPlanar` and the planar `MercatorProjection`

`Projection.isPlanar` replaces the `name === 'mercator'` checks that used to decide whether a map is flat. A registered CRS gets a `MercatorProjection` constructed with its name and tile matrix, so it shares the mercator shader variant, prelude and tile mesh. Every planar CRS therefore shares one cached program per layer type with mercator, and tiles are drawn exactly as mercator tiles are: a tile's own coordinates are already in the CRS's quad grid, and only the lng/lat mapping around the edges differs.

The projection factory checks the registry populated by `addProjection` before its built-in switch and returns a `MercatorProjection` under the CRS name together with a `MercatorTransform` constructed with the CRS helper (`TransformOptions.worldCoordinateHelper`), which `clone()` carries along so symbol placement keeps the CRS.

## Why Mercator keeps its own functions

Mercator does not go through the generic CRS formula. Its helper calls the existing `mercatorXfromLng`/`mercatorYfromLat` functions with the same arguments the transform used before the seam existed, so every Mercator value is bit-for-bit identical to the previous code, and a unit test pins the transform's outputs against values captured before the refactor. When you touch a transform call site, feed the helper the same value the old code used (the camera's `center` both for camera math and for `worldZFromAltitude`) rather than a value that would need a round trip through lng/lat.

## GeoJSON: the pseudo-lng/lat trick

The worker tiles GeoJSON with `geojson-vt`, which projects with its own hard-coded Mercator. Rather than teach the worker about every CRS, `GeoJSONSource` pre-projects on the main thread when the map's helper does not wrap: every position is moved to the lng/lat whose Mercator projection lands on the CRS's world position (`x * 360 - 180` for longitude and the inverse Mercator of `y` for latitude), so the worker's Mercator math puts the feature in the right tile. Query results are unprojected back through `lngLatFromWorld`, and cluster children and leaves are unprojected on receipt. Two consequences: a `data` URL is fetched on the main thread so the object can be rewritten, and the source's `filter` runs on pseudo coordinates in the worker, so geometry filters do not apply.

## Hillshade

The hillshade shader scales slopes by `cos(lat)` to undo Mercator's latitude stretch, with the tile's latitude range passed as `u_latrange`. `getTileLatRange` returns `[0, 0]` for a non-wrapping projection: `cos(0)` is 1, so a CRS in linear units gets no correction and the shader stays unchanged.

## Fence

Square, power-of-two quad tile grids only; one CRS per map; no world copies, no wrap, no globe transition. Anything beyond that, most of all reprojecting Mercator tile content, belongs to the [GPU reprojection discussion](https://github.com/maplibre/maplibre/issues/491).
