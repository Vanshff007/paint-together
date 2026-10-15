const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const chat = require('./server');

function setup(session = { userColor: '#000', currentName: 'Alice' }, roomData = {}) {
    const io = createFakeIo();
    const socket = createFakeSocket(io, 's1');
    socket.join('ROOM01');
    chat.register(socket, { io, roomData }, session);
    return socket;
}

// several users in one room, sharing roomData
function room() {
    const io = createFakeIo();
    const roomData = { ROOM01: { users: {} } };
    const join = (id, name, clientId) => {
        const s = createFakeSocket(io, id);
        s.data.clientId = clientId;
        s.join('ROOM01');
        chat.register(s, { io, roomData }, { userColor: '#000', currentName: name });
        return s;
    };
    return { roomData, join };
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

test('chat-history returns earlier messages in order', () => {
    const { join } = room();
    const alice = join('s1', 'Alice', 'alice-browser');
    const bob = join('s2', 'Bob', 'bob-browser');
    alice.trigger('chat-message', { roomId: 'ROOM01', text: 'hi' });
    bob.trigger('chat-message', { roomId: 'ROOM01', text: 'hey' });

    const carol = join('s3', 'Carol', 'carol-browser');
    carol.trigger('chat-history', 'ROOM01');
    assert.deepStrictEqual(last(carol.emitted, 'chat-history').data, [
        { author: 'Alice', text: 'hi' },
        { author: 'Bob', text: 'hey' }
    ]);
});

test('chat history keeps only the last MAX_CHAT_HISTORY messages', () => {
    const { roomData, join } = room();
    const alice = join('s1', 'Alice', 'alice-browser');
    for (let i = 0; i < chat.MAX_CHAT_HISTORY + 10; i++) alice.trigger('chat-message', { roomId: 'ROOM01', text: `m${i}` });
    assert.strictEqual(roomData.ROOM01.chat.length, chat.MAX_CHAT_HISTORY);

    alice.trigger('chat-history', 'ROOM01');
    const history = last(alice.emitted, 'chat-history').data;
    assert.strictEqual(history.length, chat.MAX_CHAT_HISTORY);
    assert.strictEqual(history[0].text, 'm10');
});

test('chat-history of a room without messages is []', () => {
    const { join } = room();
    const anon = join('s1', 'Anon', null);
    anon.trigger('chat-history', 'ROOM01');
    assert.deepStrictEqual(last(anon.emitted, 'chat-history').data, []);
});

test('chat-history needs membership and ignores malformed payloads', () => {
    const { join } = room();
    const alice = join('s1', 'Alice', 'a');
    for (const bad of ['OTHER1', null, undefined, 5, { roomId: 'ROOM01' }]) alice.trigger('chat-history', bad);
    assert.strictEqual(alice.emitted.length, 0);
});

test('a chat message marks the room dirty so autosave saves the history', () => {
    const { roomData, join } = room();
    const alice = join('s1', 'Alice', 'a');
    alice.trigger('chat-message', { roomId: 'ROOM01', text: 'hi' });
    assert.strictEqual(roomData.ROOM01.dirty, true);
});
