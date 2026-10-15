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
    assert.strictEqual(update.$set.passwordHash, null);
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
    assert.deepStrictEqual(missing.calls[1], ['create', { roomId: 'ROOM01', canvasState: null, hostId: 's1', users: ['Alice'], passwordHash: null }]);

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

test('autosave saves only changed rooms, once per change', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const model = fakeModel();
    const roomData = { ROOM01: room({ dirty: true }), ROOM02: room(), ROOM03: room({ dirty: true }) };
    const timer = createPersistence(roomData, model).startAutosave();

    t.mock.timers.tick(AUTOSAVE_INTERVAL_MS - 1);
    assert.strictEqual(model.calls.length, 0);
    t.mock.timers.tick(1);
    assert.deepStrictEqual(model.calls.map(c => c[1].roomId), ['ROOM01', 'ROOM03']);
    assert.strictEqual(roomData.ROOM01.dirty, false);

    await Promise.resolve();
    t.mock.timers.tick(AUTOSAVE_INTERVAL_MS);
    assert.strictEqual(model.calls.length, 2, 'unchanged rooms are not written again');
    clearInterval(timer);
});

test('a failed save keeps the room dirty so autosave retries', async (t) => {
    t.mock.method(console, 'error', () => {});
    const roomData = { ROOM01: room({ dirty: true }) };
    await createPersistence(roomData, fakeModel({ fail: true })).saveRoomState('ROOM01');
    assert.strictEqual(roomData.ROOM01.dirty, true);
});

test('Room documents expire 30 days after their last save (TTL index)', () => {
    const Room = require('./Room');
    const ttl = Room.schema.indexes().find(([fields]) => fields.updatedAt);
    assert.ok(ttl, 'TTL index on updatedAt');
    assert.strictEqual(ttl[1].expireAfterSeconds, 30 * 24 * 60 * 60);
});

// Restart test: real features wired together, a stored "database" that survives,
// and a fresh roomData standing in for the new server process.
test('canvas survives a server restart', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
    const rooms = require('../rooms/server');
    const history = require('../history/server');

    const docs = {};
    const model = {
        async findOne({ roomId }) { return docs[roomId] || null; },
        async create(doc) { docs[doc.roomId] = { ...doc }; },
        async findOneAndUpdate({ roomId }, update) { docs[roomId] = { ...docs[roomId], roomId, ...update.$set }; }
    };

    function boot() {
        const io = createFakeIo();
        const roomData = {};
        const ctx = { io, roomData, persistence: createPersistence(roomData, model) };
        return id => {
            const socket = createFakeSocket(io, id);
            const session = { userColor: '#000', currentName: id };
            rooms.register(socket, ctx, session);
            history.register(socket, ctx);
            return socket;
        };
    }

    // first server: draw one stroke, then everyone leaves
    let connect = boot();
    const alice = connect('alice');
    await alice.trigger('create-room', { userName: 'Alice' });
    const roomId = last(alice.emitted, 'room-created').data.roomId;
    alice.trigger('save-undo-snapshot', { roomId, state: null });
    alice.trigger('stroke-complete', { roomId, state: 'data:image/png;base64,DRAWN' });
    await alice.trigger('disconnecting');
    assert.strictEqual(docs[roomId].canvasState, 'data:image/png;base64,DRAWN');

    // second server: empty memory, same database
    connect = boot();
    const bob = connect('bob');
    await bob.trigger('join-room', { roomId, userName: 'Bob' });
    const joined = last(bob.emitted, 'room-joined').data;
    assert.strictEqual(joined.canvasState, 'data:image/png;base64,DRAWN');
    assert.strictEqual(joined.isHost, true);
});

test('the password hash is saved with the room and on creation', async () => {
    const model = fakeModel();
    const p = createPersistence({ ROOM01: room({ passwordHash: 'salt:hash' }) }, model);
    await p.saveRoomState('ROOM01');
    assert.strictEqual(model.calls[0][2].$set.passwordHash, 'salt:hash');

    const fresh = fakeModel();
    await createPersistence({}, fresh).ensureRoomDoc('ROOM02', 's1', 'Alice', 'salt:hash');
    assert.strictEqual(fresh.calls[1][1].passwordHash, 'salt:hash');
});

test('chat history is saved with the room', async () => {
    const model = fakeModel();
    const chat = [{ author: 'Alice', text: 'hi' }];
    await createPersistence({ ROOM01: room({ chat }) }, model).saveRoomState('ROOM01');
    assert.deepStrictEqual(model.calls[0][2].$set.chat, chat);

    const empty = fakeModel();
    await createPersistence({ ROOM01: room() }, empty).saveRoomState('ROOM01');
    assert.deepStrictEqual(empty.calls[0][2].$set.chat, []);
});

test('Room schema stores chat as plain { author, text } entries', () => {
    const Room = require('./Room');
    const doc = new Room({ roomId: 'ROOM01', chat: [{ author: 'Alice', text: 'hi', extra: 'dropped' }] });
    assert.deepStrictEqual(doc.toObject().chat, [{ author: 'Alice', text: 'hi' }]);
    assert.deepStrictEqual(new Room({ roomId: 'ROOM02' }).toObject().chat, []);
});
