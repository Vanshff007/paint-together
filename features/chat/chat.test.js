const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const chat = require('./server');

function setup(session = { userColor: '#000', currentName: 'Alice' }) {
    const io = createFakeIo();
    const socket = createFakeSocket(io, 's1');
    socket.join('ROOM01');
    chat.register(socket, { io, roomData: {} }, session);
    return socket;
}

test('chat-message is relayed to others with only author and text', () => {
    const socket = setup();
    socket.trigger('chat-message', { roomId: 'ROOM01', text: 'hi', extra: 'dropped' });
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

test('chat-message for a room the socket has not joined is ignored', () => {
    const socket = setup();
    socket.trigger('chat-message', { roomId: 'OTHER1', author: 'Alice', text: 'hi' });
    assert.strictEqual(socket.broadcasts.length, 0);
});

test('malformed chat payloads are ignored and do not throw', () => {
    const socket = setup();
    for (const bad of [null, undefined, 5, 'ROOM01']) socket.trigger('chat-message', bad);
    assert.strictEqual(socket.broadcasts.length, 0);
});

test('chat author is the server-side name, a client-sent author is ignored', () => {
    const session = { userColor: '#000', currentName: 'Mallory' };
    const socket = setup(session);
    socket.trigger('chat-message', { roomId: 'ROOM01', author: 'Alice', text: 'hi' });
    assert.strictEqual(last(socket.broadcasts, 'chat-message').data.author, 'Mallory');
    session.currentName = 'Renamed';
    socket.trigger('chat-message', { roomId: 'ROOM01', text: 'again' });
    assert.strictEqual(last(socket.broadcasts, 'chat-message').data.author, 'Renamed');
});

test('chat text is trimmed, capped, and must be a non-empty string', () => {
    const socket = setup();
    socket.trigger('chat-message', { roomId: 'ROOM01', text: '  ' + 'x'.repeat(500) + '  ' });
    assert.strictEqual(last(socket.broadcasts, 'chat-message').data.text, 'x'.repeat(chat.MAX_MESSAGE_LENGTH));
    for (const text of ['', '   ', 5, null, { a: 1 }, ['hi']]) socket.trigger('chat-message', { roomId: 'ROOM01', text });
    assert.strictEqual(socket.broadcasts.length, 1);
});
