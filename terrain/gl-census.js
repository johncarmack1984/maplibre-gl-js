// ---- WebGL allocation census: wraps the context before the map exists; window.glCensus() returns live bytes by kind
(() => {
    const BPP = new Map();
    const w2 = WebGL2RenderingContext;
    for (const [k, v] of Object.entries({RGBA: 4, RGBA8: 4, SRGB8_ALPHA8: 4, RGB: 4, RGB8: 4, R8: 1, ALPHA: 1, LUMINANCE: 1, LUMINANCE_ALPHA: 2, RG8: 2, R32F: 4, R16F: 2, RG32F: 8, RGBA16F: 8, RGBA32F: 16, RGB32F: 16, DEPTH_COMPONENT16: 2, DEPTH_COMPONENT24: 4, DEPTH_COMPONENT32F: 4, DEPTH24_STENCIL8: 4, DEPTH32F_STENCIL8: 8, DEPTH_STENCIL: 4, DEPTH_COMPONENT: 4, STENCIL_INDEX8: 1})) if (w2[k] !== undefined) BPP.set(w2[k], v);
    const bpp = f => BPP.get(f) ?? 4;
    const tex = new Map(), buf = new Map(), rb = new Map();
    const st = {unit: 0, bound: [], bufBound: new Map(), rb: null, texCreated: 0, texDeleted: 0, bufCreated: 0, bufDeleted: 0, mipmaps: 0, texStorage: 0, texImage: 0};
    const dims = s => [s.videoWidth || s.naturalWidth || s.width, s.videoHeight || s.naturalHeight || s.height];
    function wrap(gl) {
        if (gl.__census) return gl;
        gl.__census = true;
        const o = m => gl[m].bind(gl);
        const activeTexture = o('activeTexture'), bindTexture = o('bindTexture'), texStorage2D = o('texStorage2D'), texImage2D = o('texImage2D'), generateMipmap = o('generateMipmap'), deleteTexture = o('deleteTexture'), createTexture = o('createTexture');
        const bindBuffer = o('bindBuffer'), bufferData = o('bufferData'), deleteBuffer = o('deleteBuffer'), createBuffer = o('createBuffer');
        const bindRenderbuffer = o('bindRenderbuffer'), renderbufferStorage = o('renderbufferStorage'), deleteRenderbuffer = o('deleteRenderbuffer');
        const cur = target => (st.bound[st.unit] || {})[target];
        gl.activeTexture = u => { st.unit = u - gl.TEXTURE0; return activeTexture(u); };
        gl.bindTexture = (t, x) => { (st.bound[st.unit] ||= {})[t] = x; return bindTexture(t, x); };
        gl.createTexture = () => { st.texCreated++; return createTexture(); };
        gl.texStorage2D = (t, levels, ifmt, w, h) => {
            const x = cur(t); let bytes = 0; for (let l = 0; l < levels; l++) bytes += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(ifmt);
            if (x) tex.set(x, {bytes, w, h, storage: true, mip: levels > 1}); st.texStorage++;
            return texStorage2D(t, levels, ifmt, w, h);
        };
        gl.texImage2D = (...a) => {
            const x = cur(a[0]); let w, h, ifmt = a[2];
            if (a.length >= 9) { w = a[3]; h = a[4]; } else { [w, h] = dims(a[5]); }
            if (x) { const e = tex.get(x) || {bytes: 0, w, h, levels: new Map(), storage: false, mip: false}; if (!e.levels) e.levels = new Map(); e.levels.set(a[1], w * h * bpp(ifmt)); if (a[1] === 0) { e.w = w; e.h = h; } e.bytes = [...e.levels.values()].reduce((s, v) => s + v, 0) * (e.mip ? 4 / 3 : 1); tex.set(x, e); }
            st.texImage++;
            return texImage2D(...a);
        };
        gl.generateMipmap = t => { const x = cur(t); const e = x && tex.get(x); if (e && !e.storage && !e.mip) { e.mip = true; e.bytes = e.bytes * 4 / 3; } st.mipmaps++; return generateMipmap(t); };
        gl.deleteTexture = x => { st.texDeleted++; tex.delete(x); return deleteTexture(x); };
        gl.bindBuffer = (t, b) => { st.bufBound.set(t, b); return bindBuffer(t, b); };
        gl.createBuffer = () => { st.bufCreated++; return createBuffer(); };
        gl.bufferData = (t, d, u, ...r) => { const b = st.bufBound.get(t); if (b) buf.set(b, typeof d === 'number' ? d : (d?.byteLength ?? 0)); return bufferData(t, d, u, ...r); };
        gl.deleteBuffer = b => { st.bufDeleted++; buf.delete(b); return deleteBuffer(b); };
        gl.bindRenderbuffer = (t, r) => { st.rb = r; return bindRenderbuffer(t, r); };
        gl.renderbufferStorage = (t, f, w, h) => { if (st.rb) rb.set(st.rb, w * h * bpp(f)); return renderbufferStorage(t, f, w, h); };
        gl.deleteRenderbuffer = r => { rb.delete(r); return deleteRenderbuffer(r); };
        return gl;
    }
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) { const gl = getContext.call(this, type, ...a); return (gl && (type === 'webgl2' || type === 'webgl')) ? wrap(gl) : gl; };
    window.glCensus = () => {
        const bySize = {}; let texBytes = 0;
        for (const e of tex.values()) { texBytes += e.bytes; const k = `${e.w}x${e.h}${e.mip ? 'm' : ''}`; const s = bySize[k] ||= {n: 0, mb: 0}; s.n++; s.mb += e.bytes / 1048576; }
        const top = Object.entries(bySize).sort((a, b) => b[1].mb - a[1].mb).slice(0, 6).map(([k, v]) => `${k}:${v.n}=${v.mb.toFixed(0)}`).join(' ');
        let bufBytes = 0; for (const v of buf.values()) bufBytes += v;
        let rbBytes = 0; for (const v of rb.values()) rbBytes += v;
        return {texN: tex.size, texMB: +(texBytes / 1048576).toFixed(1), bufN: buf.size, bufMB: +(bufBytes / 1048576).toFixed(1), rbMB: +(rbBytes / 1048576).toFixed(1), top, created: st.texCreated, deleted: st.texDeleted};
    };
})();
