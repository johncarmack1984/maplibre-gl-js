import {describe, expect, test} from 'vitest';
import {hillshadeUniformValues} from './hillshade_program.ts';
import {OverscaledTileID} from '../../tile/tile_id.ts';
import {Tile} from '../../tile/tile.ts';
import {HillshadeStyleLayer} from '../../style/style_layer/hillshade_style_layer.ts';
import {EvaluationParameters} from '../../style/evaluation_parameters.ts';
import {createPainter, createSimpleCrsTransform} from '../../util/test/util.ts';

function createLayer(): HillshadeStyleLayer {
    const layer = new HillshadeStyleLayer({id: 'hillshade', type: 'hillshade', source: 'dem'}, {});
    layer.recalculate(new EvaluationParameters(0), []);
    return layer;
}

function createTile(z: number, x: number, y: number): Tile {
    return new Tile(new OverscaledTileID(z, 0, z, x, y), 512);
}

describe('hillshadeUniformValues u_latrange', () => {
    test('is the latitude range of the tile edges for mercator', () => {
        const painter = createPainter();
        const [top, bottom] = hillshadeUniformValues(painter, createTile(0, 0, 0), createLayer()).u_latrange as [number, number];
        expect(top).toBeCloseTo(85.0511, 3);
        expect(bottom).toBeCloseTo(-85.0511, 3);

        const [topHalf, bottomHalf] = hillshadeUniformValues(painter, createTile(1, 0, 1), createLayer()).u_latrange as [number, number];
        expect(topHalf).toBe(0);
        expect(bottomHalf).toBeCloseTo(-85.0511, 3);
    });

    test('is zero for a planar CRS so the shader applies no latitude scale correction', () => {
        const painter = createPainter(createSimpleCrsTransform(512, 512));
        expect(hillshadeUniformValues(painter, createTile(1, 0, 1), createLayer()).u_latrange).toEqual([0, 0]);
    });
});
