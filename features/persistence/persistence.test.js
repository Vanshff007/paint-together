const { test } = require('node:test');
const assert = require('node:assert');
const { createPersistence, AUTOSAVE_INTERVAL_MS } = require('./server');

// Fake Mongoose model: records calls, optional failure
function fakeModel({ existing = null, fail = false } = {}) {
    const calls = [];
    const maybeFail = () => { if (fail) throw new Error('db down'); };
    return {
        calls,
        async findOneAndUpdate(...args) { maybeFail(); calls.push(['findOneAndUpdate', ...args]); },
        async findOne(query) { maybeFail(); calls.push(['findOne', query]); return existing; },
        async create(doc) { maybeFail(); calls.push(['create', doc]); return doc; }
    };
}

function room(overrides = {}) {
    return {
        canvasState: 'data:image/png;base64,AAA',
        undoStack: ['x'], redoStack: [], pendingSnapshot: null,
        hostId: 's1',
        users: { s1: { name: 'Alice', color: '#000' }, s2: { name: 'Bob', color: '#fff' } },
        ...overrides
    };
}

test('saveRoomState upserts canvas, host and user names only', async () => {
    const model = fakeModel();
    const p = createPersistence({ ROOM01: room() }, model);
    await p.saveRoomState('ROOM01');

    const [, filter, update, options] = model.calls[0];
    assert.deepStrictEqual(filter, { roomId: 'ROOM01' });
    assert.strictEqual(update.$set.canvasState, 'data:image/png;base64,AAA');
    assert.strictEqual(update.$set.hostId, 's1');
    assert.deepStrictEqual(update.$set.users, ['Alice', 'Bob']);
    assert.strictEqual(update.$set.undoStack, undefined, 'history is never persisted');
    assert.deepStrictEqual(options, { upsert: true });
});

test('saveRoomState does nothing for a room not in memory', async () => {
    const model = fakeModel();
    await createPersistence({}, model).saveRoomState('GONE00');
    assert.strictEqual(model.calls.length, 0);
});

test('saveRoomState logs and does not throw when MongoDB fails', async (t) => {
    const errors = t.mock.method(console, 'error', () => {});
    await createPersistence({ ROOM01: room() }, fakeModel({ fail: true })).saveRoomState('ROOM01');
    assert.strictEqual(errors.mock.callCount(), 1);
});

test('ensureRoomDoc creates a document only when missing', async () => {
    const missing = fakeModel();
    await createPersistence({}, missing).ensureRoomDoc('ROOM01', 's1', 'Alice');
    assert.deepStrictEqual(missing.calls[1], ['create', { roomId: 'ROOM01', canvasState: null, hostId: 's1', users: ['Alice'] }]);

    const present = fakeModel({ existing: { roomId: 'ROOM01' } });
    await createPersistence({}, present).ensureRoomDoc('ROOM01', 's1', 'Alice');
    assert.strictEqual(present.calls.filter(c => c[0] === 'create').length, 0);
});

test('loadRoom returns the document, or null on error', async (t) => {
    const doc = { roomId: 'ROOM01', canvasState: 'png' };
    assert.strictEqual(await createPersistence({}, fakeModel({ existing: doc })).loadRoom('ROOM01'), doc);

    t.mock.method(console, 'error', () => {});
    assert.strictEqual(await createPersistence({}, fakeModel({ fail: true })).loadRoom('ROOM01'), null);
});

test('autosave saves every active room each interval', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const model = fakeModel();
    const roomData = { ROOM01: room(), ROOM02: room() };
    const timer = createPersistence(roomData, model).startAutosave();

    t.mock.timers.tick(AUTOSAVE_INTERVAL_MS - 1);
    assert.strictEqual(model.calls.length, 0);
    t.mock.timers.tick(1);
    assert.deepStrictEqual(model.calls.map(c => c[1].roomId), ['ROOM01', 'ROOM02']);
    clearInterval(timer);
});
