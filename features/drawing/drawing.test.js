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
            ROOM01: { canvasState: 'png', history: { ops: ['a'] }, hostId: 's1', users: {} }
        }
    };
    socket = createFakeSocket(io, 's1');
    socket.join('ROOM01');
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

test('mouseup is relayed with the sender socketId', () => {
    socket.trigger('mouseup', 'ROOM01');
    assert.deepStrictEqual(last(socket.broadcasts, 'mouseup').data, { socketId: 's1' });
});

test('clear resets canvas and history and tells the whole room', () => {
    socket.trigger('clear', 'ROOM01');
    const room = ctx.roomData.ROOM01;
    assert.strictEqual(room.canvasState, null);
    assert.strictEqual(room.history, undefined, 'history is recreated empty');
    assert.strictEqual(room.dirty, true);
    assert.ok(last(socket.broadcasts, 'clear'));
    assert.deepStrictEqual(last(io.emitted, 'history-update').data, { hasUndo: false, hasRedo: false });
});

test('clear on a room not in memory still relays and does not throw', () => {
    socket.join('GONE00');
    socket.trigger('clear', 'GONE00');
    assert.strictEqual(last(socket.broadcasts, 'clear').room, 'GONE00');
});

test('events for a room the socket has not joined are ignored', () => {
    socket.trigger('draw', { roomId: 'OTHER1', nx: 0, ny: 0 });
    socket.trigger('mouseup', 'OTHER1');
    socket.trigger('clear', 'OTHER1');
    assert.strictEqual(socket.broadcasts.length, 0);
    assert.strictEqual(io.emitted.length, 0);
});

test('malformed payloads are ignored and do not throw', () => {
    for (const bad of [null, undefined, 5, 'ROOM01', { roomId: 5 }]) {
        socket.trigger('draw', bad);
    }
    for (const bad of [null, undefined, 5, { roomId: 'ROOM01' }]) {
        socket.trigger('mouseup', bad);
        socket.trigger('clear', bad);
    }
    assert.strictEqual(socket.broadcasts.length, 0);
    assert.strictEqual(ctx.roomData.ROOM01.canvasState, 'png');
});
