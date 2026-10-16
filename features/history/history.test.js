const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const history = require('./server');

let io, ctx, room;

const png = (name) => `data:image/png;base64,${name}`;
const stroke = (color = '#000000') => ({ type: 'stroke', points: [[0.1, 0.1], [0.2, 0.2]], color, ns: 0.01, tool: 'brush' });
const rect = { type: 'shape', shape: 'rect', nx1: 0.1, ny1: 0.1, nx2: 0.5, ny2: 0.5, color: '#ff0000', ns: 0.01 };

beforeEach(() => {
    io = createFakeIo();
    room = { canvasState: null, hostId: 'alice', users: {} };
    ctx = { io, roomData: { ROOM01: room } };
});

// a member of ROOM01; clientId is the browser (undo follows it)
function member(id, clientId = `${id}-browser`) {
    const socket = createFakeSocket(io, id);
    socket.data.clientId = clientId;
    socket.join('ROOM01');
    room.users[id] = { name: id, color: '#000' };
    history.register(socket, ctx);
    return socket;
}

const add = (socket, op, state = png(`after-${socket.id}`)) => socket.trigger('op', { roomId: 'ROOM01', op, state });
const ops = () => (room.history ? room.history.ops : []);
const updateFor = (socket) => last(socket.emitted, 'history-update').data;

test('an op is stored, sent to the whole room with an id, and sets canvasState if sent', () => {
    const alice = member('alice');
    add(alice, stroke());
    assert.strictEqual(ops().length, 1);
    assert.strictEqual(room.canvasState, png('after-alice'));
    assert.strictEqual(room.dirty, true);
    const sent = last(io.emitted, 'op');
    assert.strictEqual(sent.room, 'ROOM01');
    assert.deepStrictEqual(sent.data, { id: 1, undone: false, ...stroke(), by: 'alice' });
    assert.deepStrictEqual(updateFor(alice), { hasUndo: true, hasRedo: false });
});

test('undo removes only your own last change', () => {
    const alice = member('alice');
    const bob = member('bob');
    add(alice, stroke('#111111'));
    add(bob, stroke('#222222'));
    add(alice, rect);

    assert.deepStrictEqual(updateFor(bob), { hasUndo: true, hasRedo: false });
    bob.trigger('undo', 'ROOM01');
    assert.deepStrictEqual(ops().map(o => o.undone), [false, true, false], 'Bob\'s stroke, not Alice\'s later rect');
    assert.deepStrictEqual(last(io.emitted, 'op-undone').data, { id: 2, by: 'bob' });
    assert.deepStrictEqual(updateFor(bob), { hasUndo: false, hasRedo: true });
    assert.deepStrictEqual(updateFor(alice), { hasUndo: true, hasRedo: false });

    alice.trigger('undo', 'ROOM01');
    alice.trigger('undo', 'ROOM01');
    assert.deepStrictEqual(ops().map(o => o.undone), [true, true, true]);
    assert.deepStrictEqual(updateFor(alice), { hasUndo: false, hasRedo: true });
});

test('redo brings back your undone changes in reverse order', () => {
    const alice = member('alice');
    add(alice, stroke());
    add(alice, rect);
    alice.trigger('undo', 'ROOM01');
    alice.trigger('undo', 'ROOM01');
    alice.trigger('redo', 'ROOM01');
    assert.deepStrictEqual(last(io.emitted, 'op-redone').data, { id: 1, by: 'alice' });
    assert.deepStrictEqual(ops().map(o => o.undone), [false, true]);
    alice.trigger('redo', 'ROOM01');
    assert.deepStrictEqual(ops().map(o => o.undone), [false, false]);
    assert.deepStrictEqual(updateFor(alice), { hasUndo: true, hasRedo: false });
});

test('a new change ends your redo, not someone else\'s', () => {
    const alice = member('alice');
    const bob = member('bob');
    add(alice, stroke());
    add(bob, stroke());
    alice.trigger('undo', 'ROOM01');
    bob.trigger('undo', 'ROOM01');
    add(alice, rect);
    assert.deepStrictEqual(updateFor(alice).hasRedo, false);
    assert.deepStrictEqual(updateFor(bob).hasRedo, true);
});

test('undo follows the browser across a reconnect (same clientId, new socket)', () => {
    const alice = member('alice', 'alice-browser');
    add(alice, stroke());
    const alice2 = member('alice-2', 'alice-browser');
    alice2.trigger('undo', 'ROOM01');
    assert.strictEqual(ops()[0].undone, true);
});

test('undo and redo with nothing to do change nothing', () => {
    const alice = member('alice');
    const bob = member('bob');
    add(alice, stroke());
    bob.trigger('undo', 'ROOM01');
    bob.trigger('redo', 'ROOM01');
    assert.strictEqual(ops()[0].undone, false);
    assert.strictEqual(last(io.emitted, 'op-undone'), undefined);
    assert.strictEqual(last(io.emitted, 'op-redone'), undefined);
});

test('canvas-state after an undo updates the saved canvas', () => {
    const alice = member('alice');
    add(alice, stroke());
    alice.trigger('undo', 'ROOM01');
    room.dirty = false;
    alice.trigger('canvas-state', { roomId: 'ROOM01', state: png('rebuilt') });
    assert.strictEqual(room.canvasState, png('rebuilt'));
    assert.strictEqual(room.dirty, true);
    alice.trigger('canvas-state', { roomId: 'ROOM01', state: 'https://evil.example/x.png' });
    assert.strictEqual(room.canvasState, png('rebuilt'));
});

test('history-sync sends the base, the ops (without author ids) and your undo state', () => {
    room.canvasState = png('saved'); // e.g. a room restored from MongoDB
    const alice = member('alice');
    add(alice, stroke());
    alice.trigger('undo', 'ROOM01');
    const bob = member('bob');
    bob.trigger('history-sync', 'ROOM01');
    const sync = last(bob.emitted, 'history-sync').data;
    assert.strictEqual(sync.baseState, png('saved'));
    assert.deepStrictEqual(sync.ops, [{ id: 1, undone: true, ...stroke() }]);
    assert.strictEqual(JSON.stringify(sync).includes('alice-browser'), false, 'no clientId leaks');
    assert.deepStrictEqual([sync.hasUndo, sync.hasRedo], [false, false]);

    alice.trigger('history-sync', 'ROOM01');
    assert.deepStrictEqual([last(alice.emitted, 'history-sync').data.hasRedo], [true]);
});

test('invalid ops, states and extra fields are rejected or dropped', () => {
    const alice = member('alice');
    const bad = [
        { ...stroke(), points: [] },
        { ...stroke(), points: [[0.1, 2]] },
        { ...stroke(), tool: 'laser' },
        { ...stroke(), color: 'red' },
        { ...rect, shape: 'triangle' },
        { type: 'shape', shape: 'image', nx1: 0, ny1: 0, nx2: 1, ny2: 1, src: 'https://evil.example/x.png' },
        { type: 'other' }, null, 5
    ];
    bad.forEach(op => add(alice, op));
    assert.strictEqual(ops().length, 0);

    // the state is optional now (canvas-state follows after a pause); a bad one is never stored
    add(alice, stroke(), 'https://evil.example/track.png');
    add(alice, stroke(), null);
    assert.strictEqual(ops().length, 2);
    assert.strictEqual(room.canvasState, null);

    add(alice, { ...stroke(), author: 'bob-browser', id: 99, undone: true, extra: 'x' });
    assert.deepStrictEqual(ops()[2].op, stroke(), 'only known fields are kept');
    assert.strictEqual(ops()[2].author, 'alice-browser');
    assert.strictEqual(ops()[2].id, 3);
});

test('events for a room the socket has not joined, and malformed payloads, are ignored', () => {
    const alice = member('alice');
    const outsider = createFakeSocket(io, 'outsider');
    history.register(outsider, ctx);
    add(outsider, stroke());
    outsider.trigger('history-sync', 'ROOM01');
    add(alice, stroke());
    outsider.trigger('undo', 'ROOM01');
    assert.strictEqual(ops().length, 1);
    assert.strictEqual(ops()[0].undone, false);
    assert.strictEqual(outsider.emitted.length, 0);

    for (const bad of [null, undefined, 5, 'ROOM01', {}, { roomId: ['ROOM01'] }]) {
        alice.trigger('op', bad);
        alice.trigger('canvas-state', bad);
        alice.trigger('compact', bad);
        alice.trigger('undo', bad);
        alice.trigger('redo', bad);
        alice.trigger('history-sync', bad);
    }
    assert.strictEqual(ops().length, 1);
});

test('over MAX_OPS, one client flattens the oldest ops into the base', () => {
    const alice = member('alice');
    const bob = member('bob');
    for (let i = 0; i < history.MAX_OPS; i++) add(alice, stroke());
    assert.strictEqual(last(alice.emitted, 'compact-request'), undefined);
    add(bob, stroke());
    const upTo = history.COMPACT_COUNT;
    assert.deepStrictEqual(last(bob.emitted, 'compact-request').data, { upTo });

    // while waiting, those oldest ops are locked
    alice.trigger('undo', 'ROOM01'); // alice's newest (id 200) is still free
    assert.strictEqual(room.history.ops.find(o => o.id === 200).undone, true);

    alice.trigger('compact', { roomId: 'ROOM01', upTo, state: png('flat') }); // not the one asked
    assert.strictEqual(room.history.ops.length, history.MAX_OPS + 1);

    bob.trigger('compact', { roomId: 'ROOM01', upTo, state: png('flat') });
    assert.strictEqual(room.history.baseState, png('flat'));
    assert.strictEqual(room.history.ops.length, history.MAX_OPS + 1 - history.COMPACT_COUNT);
    assert.strictEqual(room.history.ops[0].id, upTo + 1);
    assert.strictEqual(room.history.compacting, null);
    assert.deepStrictEqual(last(bob.broadcasts, 'history-compacted').data, { upTo, baseState: png('flat') });
});

test('locked ops cannot be undone while the flatten is pending', () => {
    const alice = member('alice');
    const bob = member('bob');
    add(alice, stroke()); // id 1, alice's only change
    for (let i = 0; i < history.MAX_OPS; i++) add(bob, stroke());
    assert.ok(room.history.compacting);
    alice.trigger('undo', 'ROOM01');
    assert.strictEqual(room.history.ops[0].undone, false, 'id 1 is inside the flatten window');
    assert.deepStrictEqual(updateFor(alice), { hasUndo: false, hasRedo: false });
});

test('a new client is asked if the one asked to flatten left', () => {
    const alice = member('alice');
    for (let i = 0; i <= history.MAX_OPS; i++) add(alice, stroke());
    assert.ok(last(alice.emitted, 'compact-request'));
    io.sockets.sockets.delete('alice'); // disconnected without answering
    const bob = member('bob');
    add(bob, stroke());
    assert.ok(last(bob.emitted, 'compact-request'));
    assert.strictEqual(room.history.compacting.socketId, 'bob');
});

test('a WebP state from one browser and a PNG state from another both work', () => {
    const alice = member('alice');
    const bob = member('bob');
    add(alice, stroke(), 'data:image/webp;base64,W1');
    assert.strictEqual(room.canvasState, 'data:image/webp;base64,W1');
    add(bob, stroke(), png('B'));
    assert.strictEqual(room.canvasState, png('B'));
});

test('isCanvasDataUrl', () => {
    assert.strictEqual(history.isCanvasDataUrl(png('A')), true);
    assert.strictEqual(history.isCanvasDataUrl('data:image/webp;base64,UklGR'), true);
    for (const bad of [null, '', 'data:image/png', 'http://x/data:image/png;base64,', ['data:image/png;base64,'],
        ' data:image/png;base64,AAA', 'data:image/webpx;base64,AAA', 'data:image/jpeg;base64,AAA']) {
        assert.strictEqual(history.isCanvasDataUrl(bad), false);
    }
});
