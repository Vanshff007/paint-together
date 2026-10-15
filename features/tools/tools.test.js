const { test } = require('node:test');
const assert = require('node:assert');
const { floodFill, hexToRgba, isValidShape, drawShape, drawText, fitImage, FILL_TOLERANCE } = require('./client');

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
