const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const history = require('./server');

let io, ctx, socket, room;

beforeEach(() => {
    io = createFakeIo();
    room = { canvasState: null, undoStack: [], redoStack: [], pendingSnapshot: null, hostId: 's1', users: {} };
    ctx = { io, roomData: { ROOM01: room } };
    socket = createFakeSocket(io, 's1');
    history.register(socket, ctx);
});

// one full stroke: snapshot of "before", then the "after" state
function stroke(before, after) {
    socket.trigger('save-undo-snapshot', { roomId: 'ROOM01', state: before });
    socket.trigger('stroke-complete', { roomId: 'ROOM01', state: after });
}

test('stroke-complete pushes the snapshot and updates canvasState', () => {
    stroke(null, 'A');
    assert.strictEqual(room.canvasState, 'A');
    assert.deepStrictEqual(room.undoStack, []); // null snapshot is not pushed
    stroke('A', 'B');
    assert.deepStrictEqual(room.undoStack, ['A']);
    assert.strictEqual(room.canvasState, 'B');
    assert.deepStrictEqual(last(io.emitted, 'history-update').data, { hasUndo: true, hasRedo: false });
});

test('undo restores the previous state and enables redo', () => {
    stroke('EMPTY', 'A');
    stroke('A', 'B');
    socket.trigger('undo', 'ROOM01');

    assert.strictEqual(room.canvasState, 'A');
    assert.deepStrictEqual(room.redoStack, ['B']);
    assert.deepStrictEqual(last(io.emitted, 'canvas-restore').data, { state: 'A', hasUndo: true, hasRedo: true });
});

test('redo re-applies the undone state', () => {
    stroke('EMPTY', 'A');
    socket.trigger('undo', 'ROOM01');
    socket.trigger('redo', 'ROOM01');

    assert.strictEqual(room.canvasState, 'A');
    assert.deepStrictEqual(last(io.emitted, 'canvas-restore').data, { state: 'A', hasUndo: true, hasRedo: false });
});

test('a new snapshot clears the redo stack', () => {
    stroke('EMPTY', 'A');
    socket.trigger('undo', 'ROOM01');
    socket.trigger('save-undo-snapshot', { roomId: 'ROOM01', state: 'EMPTY' });
    assert.deepStrictEqual(room.redoStack, []);
});

test('discard-undo-snapshot drops the pending snapshot', () => {
    socket.trigger('save-undo-snapshot', { roomId: 'ROOM01', state: 'A' });
    socket.trigger('discard-undo-snapshot', 'ROOM01');
    assert.strictEqual(room.pendingSnapshot, null);
});

test('undo stack is capped at MAX_HISTORY', () => {
    for (let i = 0; i < history.MAX_HISTORY + 5; i++) stroke(`S${i}`, `S${i + 1}`);
    assert.strictEqual(room.undoStack.length, history.MAX_HISTORY);
    assert.strictEqual(room.undoStack[0], 'S5');
});

test('undo/redo with empty stacks do nothing', () => {
    socket.trigger('undo', 'ROOM01');
    socket.trigger('redo', 'ROOM01');
    assert.strictEqual(io.emitted.length, 0);
});

test('events for unknown rooms or without roomId are ignored', () => {
    socket.trigger('save-undo-snapshot', { roomId: 'GONE00', state: 'A' });
    socket.trigger('stroke-complete', { state: 'A' });
    socket.trigger('undo', undefined);
    assert.strictEqual(io.emitted.length, 0);
    assert.strictEqual(ctx.roomData.GONE00, undefined);
});
