const { test } = require('node:test');
const assert = require('node:assert');
const { shortcutFor, TOOL_KEYS } = require('./client');

const key = (k, mods = {}) => shortcutFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test('Ctrl or Cmd + Z undoes, + Y or + Shift + Z redoes', () => {
    assert.strictEqual(key('z', { ctrlKey: true }), 'undoBtn');
    assert.strictEqual(key('z', { metaKey: true }), 'undoBtn');
    assert.strictEqual(key('y', { ctrlKey: true }), 'redoBtn');
    assert.strictEqual(key('Z', { ctrlKey: true, shiftKey: true }), 'redoBtn');
    assert.strictEqual(key('Z', { metaKey: true, shiftKey: true }), 'redoBtn');
});

test('single letters pick tools, upper or lower case', () => {
    assert.deepStrictEqual(TOOL_KEYS, { b: 'brushBtn', e: 'eraserBtn', l: 'lineBtn', r: 'rectBtn', o: 'circleBtn', f: 'fillBtn', t: 'textBtn', i: 'imageBtn' });
    for (const [k, id] of Object.entries(TOOL_KEYS)) {
        assert.strictEqual(key(k), id);
        assert.strictEqual(key(k.toUpperCase(), { shiftKey: true }), id);
    }
});

test('browser shortcuts and other keys are left alone', () => {
    assert.strictEqual(key('b', { ctrlKey: true }), null);   // Ctrl+B
    assert.strictEqual(key('r', { metaKey: true }), null);   // Cmd+R reload
    assert.strictEqual(key('f', { ctrlKey: true }), null);   // Ctrl+F find
    assert.strictEqual(key('y', { ctrlKey: true, shiftKey: true }), null);
    assert.strictEqual(key('z', { altKey: true, ctrlKey: true }), null);
    assert.strictEqual(key('e', { altKey: true }), null);
    assert.strictEqual(key('z'), null);
    assert.strictEqual(key('Enter'), null);
    assert.strictEqual(key(' '), null);
    assert.strictEqual(shortcutFor({}), null);
});
