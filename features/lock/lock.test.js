const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const lock = require('./server');

let io, ctx, room;

beforeEach(() => {
    io = createFakeIo();
    room = { hostId: 'host', users: {} };
    ctx = { io, roomData: { ROOM01: room } };
});

// a member of ROOM01, with the lock feature's middleware and handler
function member(id) {
    const socket = createFakeSocket(io, id);
    socket.middleware = [];
    socket.use = (fn) => socket.middleware.push(fn);
    socket.join('ROOM01');
    lock.register(socket, ctx);
    return socket;
}

// true if the middleware lets the event through to the handlers
function passes(socket, event, data) {
    let passed = false;
    socket.middleware.forEach(fn => fn([event, data], () => { passed = true; }));
    return passed;
}

test('only the host can lock and unlock; everyone is told', () => {
    const host = member('host');
    const guest = member('guest');
    guest.trigger('lock-room', { roomId: 'ROOM01', locked: true });
    assert.strictEqual(room.locked, undefined);

    host.trigger('lock-room', { roomId: 'ROOM01', locked: true });
    assert.strictEqual(room.locked, true);
    assert.strictEqual(room.dirty, true, 'saved with the room');
    assert.deepStrictEqual(last(io.emitted, 'room-locked'), { room: 'ROOM01', event: 'room-locked', data: { locked: true } });

    host.trigger('lock-room', { roomId: 'ROOM01', locked: 'yes' }); // only true locks
    assert.strictEqual(room.locked, false);
});

test('a locked room drops drawing events from everyone but the host', () => {
    const host = member('host');
    const guest = member('guest');
    room.locked = true;
    for (const event of lock.DRAWING_EVENTS) {
        assert.strictEqual(passes(guest, event, { roomId: 'ROOM01' }), false, event);
        assert.strictEqual(passes(guest, event, 'ROOM01'), false, `${event} (bare roomId)`);
        assert.strictEqual(passes(host, event, { roomId: 'ROOM01' }), true, `host ${event}`);
    }
    // chat, cursors and history sync still work for viewers
    for (const event of ['chat-message', 'cursor-move', 'history-sync', 'canvas-state']) {
        assert.strictEqual(passes(guest, event, { roomId: 'ROOM01' }), true, event);
    }
    room.locked = false;
    assert.strictEqual(passes(guest, 'op', { roomId: 'ROOM01' }), true, 'unlocked again');
});

test('lock-room ignores outsiders and malformed payloads', () => {
    const outsider = createFakeSocket(io, 'host'); // even with the host's id, not in the room
    outsider.use = () => {};
    lock.register(outsider, ctx);
    outsider.trigger('lock-room', { roomId: 'ROOM01', locked: true });
    outsider.trigger('lock-room', null);
    assert.strictEqual(room.locked, undefined);
});
