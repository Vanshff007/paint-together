const { test } = require('node:test');
const assert = require('node:assert');
const { pinchTransform, MAX_ZOOM } = require('./client');

const W = 400, H = 250;
const none = { scale: 1, x: 0, y: 0 };

// canvas point (in unzoomed frame px) shown at screen point (mx, my) under a transform
const pointAt = (t, mx, my) => [(mx - t.x) / t.scale, (my - t.y) / t.scale];

test('spreading the fingers zooms in around their midpoint', () => {
    const start = { ...none, d: 100, mx: 200, my: 125 };
    const t = pinchTransform(start, 200, 200, 125, W, H);
    assert.strictEqual(t.scale, 2);
    assert.deepStrictEqual(pointAt(t, 200, 125), [200, 125], 'the point under the fingers stays put');
});

test('moving both fingers pans, keeping the same canvas point under them', () => {
    const zoomed = { scale: 2, x: -200, y: -125 };
    const start = { ...zoomed, d: 100, mx: 200, my: 125 };
    const t = pinchTransform(start, 100, 150, 100, W, H);
    assert.strictEqual(t.scale, 2);
    assert.deepStrictEqual(pointAt(t, 150, 100), pointAt(zoomed, 200, 125));
});

test('zoom stays between 1x and MAX_ZOOM', () => {
    const start = { ...none, d: 100, mx: 200, my: 125 };
    assert.strictEqual(pinchTransform(start, 10000, 200, 125, W, H).scale, MAX_ZOOM);
    assert.deepStrictEqual(pinchTransform(start, 10, 200, 125, W, H), none);
});

test('close to 1x snaps back to no zoom and no offset', () => {
    const start = { scale: 2, x: -100, y: -50, d: 100, mx: 200, my: 125 };
    assert.deepStrictEqual(pinchTransform(start, 51, 200, 125, W, H), none);
});

test('the zoomed canvas always covers the frame (no gaps when panning)', () => {
    const start = { ...none, d: 100, mx: 0, my: 0 };
    // zoom at the top-left corner, then drag the fingers far right and down
    const t = pinchTransform(start, 200, 1000, 1000, W, H);
    assert.deepStrictEqual([t.x, t.y], [0, 0]);
    // and far left and up: the right and bottom edges stop at the frame edge
    const t2 = pinchTransform({ ...none, d: 100, mx: W, my: H }, 200, -1000, -1000, W, H);
    assert.deepStrictEqual([t2.x, t2.y], [W - W * 2, H - H * 2]);
});
