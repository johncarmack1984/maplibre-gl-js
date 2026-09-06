import {describe, test, expect, vi} from 'vitest';
import {Context} from './context.ts';
import {createNullGL} from '../util/test/null_gl.ts';

describe('Context.bindTexture2D', () => {
    function createContext() {
        const gl = createNullGL();
        const context = new Context(gl);
        vi.mocked(gl.bindTexture).mockClear();
        vi.mocked(gl.activeTexture).mockClear();
        return {gl, context};
    }

    test('binds a texture to a unit once and skips the GL calls while it stays bound there', () => {
        const {gl, context} = createContext();
        const texture = gl.createTexture();

        context.bindTexture2D(gl.TEXTURE2, texture);
        context.bindTexture2D(gl.TEXTURE2, texture);

        expect(gl.bindTexture).toHaveBeenCalledTimes(1);
        expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, texture);
        expect(gl.activeTexture).toHaveBeenCalledTimes(1);
        expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE2);
    });

    test('tracks each unit separately', () => {
        const {gl, context} = createContext();
        const texture = gl.createTexture();

        context.bindTexture2D(gl.TEXTURE0, texture);
        context.bindTexture2D(gl.TEXTURE1, texture);
        context.bindTexture2D(gl.TEXTURE0, texture);

        expect(gl.bindTexture).toHaveBeenCalledTimes(2);
        expect(gl.activeTexture).toHaveBeenLastCalledWith(gl.TEXTURE1);
    });

    test('binds another texture to the same unit', () => {
        const {gl, context} = createContext();
        const first = gl.createTexture();
        const second = gl.createTexture();

        context.bindTexture2D(gl.TEXTURE0, first);
        context.bindTexture2D(gl.TEXTURE0, second);

        expect(gl.bindTexture).toHaveBeenCalledTimes(2);
        expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_2D, second);
    });

    test('binds again after the state was made dirty by code outside the context', () => {
        const {gl, context} = createContext();
        const texture = gl.createTexture();

        context.bindTexture2D(gl.TEXTURE0, texture);
        context.setDirty();
        context.bindTexture2D(gl.TEXTURE0, texture);

        expect(gl.bindTexture).toHaveBeenCalledTimes(2);
    });

    test('binds again after the texture was forgotten for deletion', () => {
        const {gl, context} = createContext();
        const texture = gl.createTexture();

        context.bindTexture2D(gl.TEXTURE3, texture);
        context.forgetTexture(texture);
        context.bindTexture2D(gl.TEXTURE3, texture);

        expect(gl.bindTexture).toHaveBeenCalledTimes(2);
    });
});
