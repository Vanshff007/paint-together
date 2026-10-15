const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const cursors = require('./server');

let io, socket, session;

beforeEach(() => {
    io = createFakeIo();
    socket = createFakeSocket(io, 's1');
    socket.join('ROOM01');
    session = { userColor: '#ec4899', currentName: 'Alice' };
    cursors.register(socket, { io, roomData: {} }, session);
});

test('cursor-move is relayed with server-side color and name', () => {
    socket.trigger('cursor-move', { roomId: 'ROOM01', nx: 0.1, ny: 0.2, color: '#spoofed', name: 'Spoofed' });
    assert.deepStrictEqual(last(socket.broadcasts, 'cursor-move'), {
        room: 'ROOM01',
        event: 'cursor-move',
        data: { socketId: 's1', nx: 0.1, ny: 0.2, x: undefined, y: undefined, color: '#ec4899', name: 'Alice' }
    });
});

test('cursor-move uses the latest session name', () => {
    session.currentName = 'Renamed';
    socket.trigger('cursor-move', { roomId: 'ROOM01', nx: 0, ny: 0 });
    assert.strictEqual(last(socket.broadcasts, 'cursor-move').data.name, 'Renamed');
});

test('cursor-move without roomId is ignored', () => {
    socket.trigger('cursor-move', { nx: 0, ny: 0 });
    assert.strictEqual(socket.broadcasts.length, 0);
});

test('cursor-leave hides the cursor for others', () => {
    socket.trigger('cursor-leave', 'ROOM01');
    assert.deepStrictEqual(last(socket.broadcasts, 'cursor-hide'), { room: 'ROOM01', event: 'cursor-hide', data: 's1' });
});

test('cursor events for a room the socket has not joined are ignored', () => {
    socket.trigger('cursor-move', { roomId: 'OTHER1', nx: 0, ny: 0 });
    socket.trigger('cursor-leave', 'OTHER1');
    assert.strictEqual(socket.broadcasts.length, 0);
});

test('malformed cursor payloads are ignored and do not throw', () => {
    for (const bad of [null, undefined, 5, { roomId: 5 }]) {
        socket.trigger('cursor-move', bad);
        socket.trigger('cursor-leave', bad);
    }
    assert.strictEqual(socket.broadcasts.length, 0);
});
