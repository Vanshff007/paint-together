const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const drawing = require('./server');

let io, ctx, socket;

beforeEach(() => {
    io = createFakeIo();
    ctx = {
        io,
        roomData: {
            ROOM01: { canvasState: 'png', undoStack: ['a'], redoStack: ['b'], pendingSnapshot: null, hostId: 's1', users: {} }
        }
    };
    socket = createFakeSocket(io, 's1');
    drawing.register(socket, ctx);
});

test('draw is relayed to the room with the sender socketId', () => {
    const point = { roomId: 'ROOM01', nx: 0.5, ny: 0.25, ns: 0.01, color: '#000000', tool: 'brush', isStart: true };
    socket.trigger('draw', point);
    assert.deepStrictEqual(last(socket.broadcasts, 'draw'), {
        room: 'ROOM01', event: 'draw', data: { ...point, socketId: 's1' }
    });
});

test('draw without roomId is ignored', () => {
    socket.trigger('draw', { nx: 0.5, ny: 0.5 });
    assert.strictEqual(socket.broadcasts.length, 0);
});

test('draw-shape is relayed unchanged', () => {
    socket.trigger('draw-shape', { roomId: 'ROOM01', shape: 'rect' });
    assert.deepStrictEqual(last(socket.broadcasts, 'draw-shape').data, { roomId: 'ROOM01', shape: 'rect' });
});

test('mouseup is relayed with the sender socketId', () => {
    socket.trigger('mouseup', 'ROOM01');
    assert.deepStrictEqual(last(socket.broadcasts, 'mouseup').data, { socketId: 's1' });
});

test('clear resets canvas and history and tells the whole room', () => {
    socket.trigger('clear', 'ROOM01');
    const room = ctx.roomData.ROOM01;
    assert.strictEqual(room.canvasState, null);
    assert.deepStrictEqual(room.undoStack, []);
    assert.deepStrictEqual(room.redoStack, []);
    assert.ok(last(socket.broadcasts, 'clear'));
    assert.deepStrictEqual(last(io.emitted, 'history-update').data, { hasUndo: false, hasRedo: false });
});

test('clear on a room not in memory still relays and does not throw', () => {
    socket.trigger('clear', 'GONE00');
    assert.strictEqual(last(socket.broadcasts, 'clear').room, 'GONE00');
});
