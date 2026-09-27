const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const chat = require('./server');

function setup() {
    const io = createFakeIo();
    const socket = createFakeSocket(io, 's1');
    chat.register(socket, { io, roomData: {} });
    return socket;
}

test('chat-message is relayed to others with only author and text', () => {
    const socket = setup();
    socket.trigger('chat-message', { roomId: 'ROOM01', author: 'Alice', text: 'hi', extra: 'dropped' });
    assert.deepStrictEqual(last(socket.broadcasts, 'chat-message'), {
        room: 'ROOM01', event: 'chat-message', data: { author: 'Alice', text: 'hi' }
    });
});

test('chat-message is not echoed to the sender', () => {
    const socket = setup();
    socket.trigger('chat-message', { roomId: 'ROOM01', author: 'Alice', text: 'hi' });
    assert.strictEqual(socket.emitted.length, 0);
});

test('chat-message without roomId is ignored', () => {
    const socket = setup();
    socket.trigger('chat-message', { author: 'Alice', text: 'hi' });
    assert.strictEqual(socket.broadcasts.length, 0);
});
