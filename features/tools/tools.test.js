const { test } = require('node:test');
const assert = require('node:assert');
const { floodFill, hexToRgba, isValidShape, drawShape, drawText, fitImage, isValidOp, cleanOp, drawOp, moveRegion, moveBox, pixelToHex, FILL_TOLERANCE, MAX_STROKE_POINTS } = require('./client');

// w x h image of one RGBA color, plus helpers to read/write pixels
function image(w, h, rgba = [0, 0, 0, 0]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
    return { data, width: w, height: h };
}
const px  = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const set = (img, x, y, rgba) => img.data.set(rgba, (y * img.width + x) * 4);
const RED = [255, 0, 0, 255], BLACK = [0, 0, 0, 255], WHITE = [255, 255, 255, 255];

test('hexToRgba', () => {
    assert.deepStrictEqual(hexToRgba('#FF8040'), [255, 128, 64, 255]);
    assert.deepStrictEqual(hexToRgba('#000000'), [0, 0, 0, 255]);
});

test('fill covers the whole connected area of a blank canvas', () => {
    const img = image(10, 8);
    assert.strictEqual(floodFill(img, 3, 3, RED), 80);
    assert.deepStrictEqual(px(img, 0, 0), RED);
    assert.deepStrictEqual(px(img, 9, 7), RED);
});

test('fill stops at a closed outline and does not leak through it', () => {
    // black square outline from (2,2) to (6,6) on a white 9x9 image
    const img = image(9, 9, WHITE);
    for (let i = 2; i <= 6; i++) { set(img, i, 2, BLACK); set(img, i, 6, BLACK); set(img, 2, i, BLACK); set(img, 6, i, BLACK); }
    assert.strictEqual(floodFill(img, 4, 4, RED), 9); // the 3x3 inside
    assert.deepStrictEqual(px(img, 4, 4), RED);
    assert.deepStrictEqual(px(img, 2, 4), BLACK);
    assert.deepStrictEqual(px(img, 0, 0), WHITE);
});

test('fill follows concave shapes (scanline spans above and below)', () => {
    // a U shape of white inside black: fill from one arm reaches the other
    const img = image(7, 5, BLACK);
    for (let y = 0; y < 4; y++) { set(img, 1, y, WHITE); set(img, 5, y, WHITE); }
    for (let x = 1; x <= 5; x++) set(img, x, 3, WHITE);
    assert.strictEqual(floodFill(img, 1, 0, RED), 4 + 4 + 3);
    assert.deepStrictEqual(px(img, 5, 0), RED);
    assert.deepStrictEqual(px(img, 3, 1), BLACK);
});

test('transparent (never drawn) and white (erased) count as the same color', () => {
    const img = image(6, 1);
    set(img, 3, 0, WHITE);
    assert.strictEqual(floodFill(img, 0, 0, RED), 6);
});

test('tolerance covers anti-aliased edge pixels, not real colors', () => {
    const img = image(4, 1, WHITE);
    set(img, 1, 0, [240, 240, 240, 255]); // edge shade, within tolerance
    set(img, 2, 0, [100, 100, 100, 255]); // a real color, outside it
    assert.strictEqual(floodFill(img, 0, 0, RED, FILL_TOLERANCE), 2);
    assert.deepStrictEqual(px(img, 2, 0), [100, 100, 100, 255]);
});

test('filling with the same color, or outside the image, changes nothing', () => {
    const img = image(3, 3, RED);
    assert.strictEqual(floodFill(img, 1, 1, RED), 0);
    assert.strictEqual(floodFill(img, -1, 0, BLACK), 0);
    assert.strictEqual(floodFill(img, 3, 0, BLACK), 0);
    assert.deepStrictEqual(px(img, 1, 1), RED);
});

test('a near-same fill color terminates (no endless loop)', () => {
    const img = image(50, 50, WHITE);
    assert.strictEqual(floodFill(img, 0, 0, [250, 250, 250, 255], FILL_TOLERANCE), 2500);
});

test('fill of a full-size canvas is fast', () => {
    const img = image(1920, 1080);
    const start = Date.now();
    assert.strictEqual(floodFill(img, 0, 0, RED, FILL_TOLERANCE), 1920 * 1080);
    assert.ok(Date.now() - start < 1000, `took ${Date.now() - start} ms`);
});

test('isValidShape accepts good shapes and fills', () => {
    const line = { shape: 'line', nx1: 0, ny1: 0.5, nx2: 1, ny2: 0.25, color: '#ff0000', ns: 0.01 };
    assert.strictEqual(isValidShape(line), true);
    assert.strictEqual(isValidShape({ ...line, shape: 'rect' }), true);
    assert.strictEqual(isValidShape({ ...line, shape: 'circle' }), true);
    assert.strictEqual(isValidShape({ shape: 'fill', nx1: 0.5, ny1: 0.5, color: '#00FF00' }), true);
});

test('isValidShape rejects bad payloads', () => {
    const line = { shape: 'line', nx1: 0, ny1: 0.5, nx2: 1, ny2: 0.25, color: '#ff0000', ns: 0.01 };
    for (const bad of [
        null, undefined, 5, {},
        { ...line, shape: 'triangle' },
        { ...line, nx2: 1.5 }, { ...line, ny1: -0.1 }, { ...line, nx1: '0.5' }, { ...line, nx2: NaN },
        { ...line, ns: 0 }, { ...line, ns: 2 }, { ...line, ns: undefined },
        { ...line, color: 'red' }, { ...line, color: '#fff' }, { ...line, color: 'url(x)' },
        { shape: 'fill', nx1: 0.5, color: '#000000' }
    ]) assert.strictEqual(isValidShape(bad), false, JSON.stringify(bad));
});

test('drawShape: line, rect and the ellipse inside the drag box', () => {
    const calls = [];
    const fake = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
        set: (t, k, v) => { t[k] = v; return true; }
    });
    drawShape(fake, 'line', 1, 2, 3, 4, '#ff0000', 5);
    assert.ok(calls.some(c => c[0] === 'moveTo' && c[1] === 1 && c[2] === 2));
    assert.ok(calls.some(c => c[0] === 'lineTo' && c[1] === 3 && c[2] === 4));
    assert.strictEqual(fake.lineWidth, 5);
    assert.strictEqual(fake.strokeStyle, '#ff0000');

    calls.length = 0;
    drawShape(fake, 'rect', 10, 10, 4, 2, '#000000', 1);
    assert.deepStrictEqual(calls.find(c => c[0] === 'rect'), ['rect', 10, 10, -6, -8]);

    calls.length = 0;
    drawShape(fake, 'circle', 0, 0, 10, 4, '#000000', 1);
    assert.deepStrictEqual(calls.find(c => c[0] === 'ellipse').slice(1, 5), [5, 2, 5, 2]);
});

test('isValidShape: text', () => {
    const text = { shape: 'text', nx1: 0.1, ny1: 0.2, text: 'Hello', color: '#000000', ns: 0.02 };
    assert.strictEqual(isValidShape(text), true);
    for (const bad of [
        { ...text, text: '' }, { ...text, text: 'x'.repeat(101) }, { ...text, text: 5 }, { ...text, text: undefined },
        { ...text, color: 'red' }, { ...text, ns: 0 }, { ...text, nx1: 2 }
    ]) assert.strictEqual(isValidShape(bad), false, JSON.stringify(bad));
});

test('isValidShape: image accepts only inline PNG, JPEG or WebP data', () => {
    const image = { shape: 'image', nx1: 0.2, ny1: 0.2, nx2: 0.8, ny2: 0.8, src: 'data:image/jpeg;base64,/9j/4AAQ' };
    assert.strictEqual(isValidShape(image), true);
    assert.strictEqual(isValidShape({ ...image, src: 'data:image/png;base64,iVBOR=' }), true);
    assert.strictEqual(isValidShape({ ...image, src: 'data:image/webp;base64,UklGR' }), true);
    for (const src of ['https://evil.example/x.jpg', '//evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=',
        'data:image/jpeg;base64,abc" onerror="x', 'data:text/html;base64,PGI+', '', 5, undefined]) {
        assert.strictEqual(isValidShape({ ...image, src }), false, String(src));
    }
    assert.strictEqual(isValidShape({ ...image, nx2: 0.1 }), false, 'box must have positive size');
    assert.strictEqual(isValidShape({ ...image, ny2: 1.5 }), false);
});

test('drawText draws bold text from its top-left corner', () => {
    const calls = [];
    const fake = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
        set: (t, k, v) => { t[k] = v; return true; }
    });
    drawText(fake, 'Hi', 10, 20, '#ff0000', 30);
    assert.deepStrictEqual(calls.find(c => c[0] === 'fillText'), ['fillText', 'Hi', 10, 20]);
    assert.strictEqual(fake.font, 'bold 30px sans-serif');
    assert.strictEqual(fake.textBaseline, 'top');
    assert.strictEqual(fake.fillStyle, '#ff0000');
});

test('fitImage keeps the shape and only shrinks', () => {
    assert.deepStrictEqual(fitImage(4000, 3000, 768, 480), { w: 640, h: 480 });
    assert.deepStrictEqual(fitImage(3000, 1000, 768, 480), { w: 768, h: 256 });
    assert.deepStrictEqual(fitImage(100, 50, 768, 480), { w: 100, h: 50 }, 'small images keep their size');
    assert.deepStrictEqual(fitImage(10000, 1, 768, 480), { w: 768, h: 1 }, 'never 0 px');
});

// fake 2D context: records calls, keeps property values
function recorder() {
    const calls = [];
    const fake = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, ...args]); return k === 'getImageData' ? t.__image : undefined; }),
        set: (t, k, v) => { t[k] = v; return true; }
    });
    return { fake, calls };
}

const strokeOp = { type: 'stroke', points: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], color: '#00ff00', ns: 0.01, tool: 'brush' };

test('isValidOp: strokes and shapes', () => {
    assert.strictEqual(isValidOp(strokeOp), true);
    assert.strictEqual(isValidOp({ ...strokeOp, tool: 'eraser' }), true);
    assert.strictEqual(isValidOp({ type: 'shape', shape: 'fill', nx1: 0.5, ny1: 0.5, color: '#000000' }), true);
    const tooLong = Array.from({ length: MAX_STROKE_POINTS + 1 }, () => [0.5, 0.5]);
    for (const bad of [
        null, 5, {}, { type: 'stroke' }, { ...strokeOp, points: [] }, { ...strokeOp, points: tooLong },
        { ...strokeOp, points: [[0.1]] }, { ...strokeOp, points: [[0.1, 1.1]] }, { ...strokeOp, points: 'x' },
        { ...strokeOp, tool: 'fill' }, { ...strokeOp, ns: 0 }, { ...strokeOp, color: '#fff' },
        { type: 'shape', shape: 'rect' }, { type: 'image' }
    ]) assert.strictEqual(isValidOp(bad), false, JSON.stringify(bad));
});

test('cleanOp keeps only known fields', () => {
    assert.deepStrictEqual(cleanOp({ ...strokeOp, id: 9, author: 'x', by: 'y', extra: 1 }), strokeOp);
});

test('drawOp: a stroke is drawn segment by segment in canvas pixels', () => {
    const { fake, calls } = recorder();
    drawOp(fake, strokeOp, 1000, 500);
    assert.deepStrictEqual(calls.filter(c => c[0] === 'moveTo')[0], ['moveTo', 100, 100]);
    assert.deepStrictEqual(calls.filter(c => c[0] === 'lineTo').map(c => c.slice(1)), [[300, 200], [500, 300]]);
    assert.strictEqual(calls.filter(c => c[0] === 'stroke').length, 2);
    assert.strictEqual(fake.lineWidth, 10);
    assert.strictEqual(fake.strokeStyle, '#00ff00');
    const eraser = recorder();
    drawOp(eraser.fake, { ...strokeOp, tool: 'eraser' }, 1000, 500);
    assert.strictEqual(eraser.fake.strokeStyle, '#ffffff');
});

test('drawOp: shapes, text and images in canvas pixels', () => {
    const shape = recorder();
    drawOp(shape.fake, { type: 'shape', shape: 'rect', nx1: 0.1, ny1: 0.2, nx2: 0.5, ny2: 0.6, color: '#000000', ns: 0.01 }, 1000, 500);
    assert.deepStrictEqual(shape.calls.find(c => c[0] === 'rect'), ['rect', 100, 100, 400, 200]);

    const text = recorder();
    drawOp(text.fake, { type: 'shape', shape: 'text', nx1: 0.1, ny1: 0.2, text: 'Hi', color: '#000000', ns: 0.03 }, 1000, 500);
    assert.deepStrictEqual(text.calls.find(c => c[0] === 'fillText'), ['fillText', 'Hi', 100, 100]);
    assert.strictEqual(text.fake.font, 'bold 30px sans-serif');

    const image = recorder();
    const op = { type: 'shape', shape: 'image', nx1: 0.1, ny1: 0.2, nx2: 0.5, ny2: 0.6, src: 'data:image/png;base64,AA' };
    drawOp(image.fake, op, 1000, 500, 'IMG');
    assert.deepStrictEqual(image.calls.find(c => c[0] === 'drawImage'), ['drawImage', 'IMG', 100, 100, 400, 200]);
    const missing = recorder();
    drawOp(missing.fake, op, 1000, 500, null);
    assert.strictEqual(missing.calls.some(c => c[0] === 'drawImage'), false, 'a picture that failed to load is skipped');
});

test('drawOp: fill works on the context pixels', () => {
    const { fake, calls } = recorder();
    const data = new Uint8ClampedArray(4 * 4 * 4);
    fake.__image = { data, width: 4, height: 4 };
    drawOp(fake, { type: 'shape', shape: 'fill', nx1: 0, ny1: 0, color: '#ff0000' }, 4, 4);
    assert.deepStrictEqual(Array.from(data.slice(0, 4)), [255, 0, 0, 255]);
    assert.ok(calls.some(c => c[0] === 'putImageData'));
});

// RGBA image of w x h, all pixels set to px
function solid(w, h, px) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) data.set(px, i);
    return { data, width: w, height: h };
}
const at = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

test('moveRegion moves a block, leaves paper behind, and lays it over the target', () => {
    const img = solid(4, 4, [0, 0, 255, 255]);       // blue page
    img.data.set([255, 0, 0, 255], (0 * 4 + 0) * 4); // red at 0,0
    img.data.set([0, 0, 0, 0], (0 * 4 + 1) * 4);     // transparent at 1,0
    moveRegion(img, 0, 0, 2, 1, 2, 3);                // the 2x1 block at 0,0 to 2,3
    assert.deepStrictEqual(at(img, 0, 0), [0, 0, 0, 0], 'old spot is empty');
    assert.deepStrictEqual(at(img, 1, 0), [0, 0, 0, 0]);
    assert.deepStrictEqual(at(img, 2, 3), [255, 0, 0, 255], 'red arrived');
    assert.deepStrictEqual(at(img, 3, 3), [0, 0, 255, 255], 'transparent part shows what was below');
});

test('moveRegion blends semi-transparent pixels, drops what leaves the canvas, ignores bad boxes', () => {
    const img = solid(3, 1, [0, 0, 0, 0]);
    img.data.set([255, 255, 255, 255], 8);          // white at 2,0
    img.data.set([0, 0, 0, 128], 0);                // half black at 0,0
    moveRegion(img, 0, 0, 1, 1, 2, 0);
    assert.deepStrictEqual(at(img, 2, 0), [127, 127, 127, 255]);

    const edge = solid(2, 1, [9, 9, 9, 255]);
    moveRegion(edge, 0, 0, 1, 1, 5, 0);             // off the canvas
    assert.deepStrictEqual(at(edge, 0, 0), [0, 0, 0, 0]);
    assert.deepStrictEqual(at(edge, 1, 0), [9, 9, 9, 255]);

    const same = solid(2, 2, [1, 2, 3, 255]);
    moveRegion(same, 1, 1, 2, 2, 0, 0);             // box past the edge: no change
    assert.deepStrictEqual(Array.from(same.data), Array.from(solid(2, 2, [1, 2, 3, 255]).data));
});

test('move ops: valid boxes and offsets only, whole pixels', () => {
    const move = { type: 'shape', shape: 'move', nx1: 0.1, ny1: 0.1, nx2: 0.3, ny2: 0.2, dx: 0.5, dy: -0.1 };
    assert.strictEqual(isValidOp(move), true);
    assert.strictEqual(isValidOp({ ...move, nx2: 0.1 }), false, 'empty box');
    assert.strictEqual(isValidOp({ ...move, dx: 2 }), false);
    assert.strictEqual(isValidOp({ ...move, dy: 'x' }), false);
    assert.deepStrictEqual(cleanOp({ ...move, evil: 1 }), move);
    assert.deepStrictEqual(moveBox(move, 1280, 800), { x: 128, y: 80, w: 256, h: 80, dx: 640, dy: -80 });
});

test('pixelToHex reads a pixel as it looks on white paper', () => {
    assert.strictEqual(pixelToHex([255, 0, 0, 255]), '#ff0000');
    assert.strictEqual(pixelToHex([0, 0, 0, 0]), '#ffffff');
    assert.strictEqual(pixelToHex([0, 0, 0, 128]), '#7f7f7f');
    assert.strictEqual(pixelToHex([18, 52, 86, 255]), '#123456');
});
