const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket, last } = require('../fake-socket');
const rooms = require('./server');

let io, ctx, db, saved;

beforeEach(() => {
    io = createFakeIo();
    db = {};
    saved = [];
    ctx = {
        io,
        roomData: {},
        persistence: {
            ensureRoomDoc: async (roomId, hostId, userName) => { db[roomId] = db[roomId] || { roomId, canvasState: null, hostId, users: [userName] }; },
            loadRoom: async (roomId) => db[roomId] || null,
            saveRoomState: async (roomId) => { saved.push(roomId); }
        }
    };
});

function connect(id) {
    const socket = createFakeSocket(io, id);
    const session = { userColor: '#22c55e', currentName: `User_${id.substring(0, 4)}` };
    rooms.register(socket, ctx, session);
    return socket;
}

async function createRoom(socket, userName = 'Alice') {
    await socket.trigger('create-room', { userName });
    return last(socket.emitted, 'room-created').data.roomId;
}

test('generateRoomId returns uppercase alphanumeric, max 6 chars', () => {
    for (let i = 0; i < 100; i++) {
        assert.match(rooms.generateRoomId(), /^[A-Z0-9]{1,6}$/);
    }
});

test('create-room makes the creator host and stores the room', async () => {
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);

    const created = last(alice.emitted, 'room-created').data;
    assert.strictEqual(created.isHost, true);
    assert.strictEqual(created.userName, 'Alice');
    assert.strictEqual(created.userCount, 1);
    assert.strictEqual(ctx.roomData[roomId].hostId, 'alice-socket');
    assert.ok(db[roomId], 'MongoDB document requested');
});

test('create-room trims and truncates the name to 20 chars', async () => {
    const alice = connect('alice-socket');
    await alice.trigger('create-room', { userName: '   ' + 'x'.repeat(30) + '  ' });
    assert.strictEqual(last(alice.emitted, 'room-created').data.userName, 'x'.repeat(20));
});

test('create-room without a name uses the default socket name', async () => {
    const alice = connect('alice-socket');
    await alice.trigger('create-room', {});
    assert.strictEqual(last(alice.emitted, 'room-created').data.userName, 'User_alic');
});

test('join-room on an unknown room emits room-not-found', async () => {
    const bob = connect('bob-socket');
    await bob.trigger('join-room', { roomId: 'NOPE00', userName: 'Bob' });
    assert.strictEqual(last(bob.emitted, 'room-not-found').data, 'NOPE00');
    assert.strictEqual(ctx.roomData.NOPE00, undefined);
});

test('join-room joins an existing room as non-host and gets existing users', async () => {
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);
    const bob = connect('bob-socket');
    await bob.trigger('join-room', { roomId, userName: 'Bob' });

    const joined = last(bob.emitted, 'room-joined').data;
    assert.strictEqual(joined.isHost, false);
    assert.strictEqual(joined.hostId, 'alice-socket');
    assert.strictEqual(joined.userCount, 2);
    assert.deepStrictEqual(Object.keys(last(bob.emitted, 'existing-users').data), ['alice-socket']);
    assert.strictEqual(last(bob.broadcasts, 'user-joined').data.name, 'Bob');
    assert.strictEqual(last(io.emitted, 'user-count-update').data, 2);
});

test('join-room accepts a bare roomId string', async () => {
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);
    const bob = connect('bob-socket');
    await bob.trigger('join-room', roomId);
    assert.ok(last(bob.emitted, 'room-joined'));
});

test('join-room restores a room from MongoDB and makes the joiner host', async () => {
    db.SAVED1 = { roomId: 'SAVED1', canvasState: 'data:image/png;base64,AAA', hostId: 'dead-socket' };
    const bob = connect('bob-socket');
    await bob.trigger('join-room', { roomId: 'SAVED1', userName: 'Bob' });

    const joined = last(bob.emitted, 'room-joined').data;
    assert.strictEqual(joined.canvasState, 'data:image/png;base64,AAA');
    assert.strictEqual(joined.isHost, true);
});

test('kick-user: only the host can kick, and not themselves', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'log', () => {});
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);
    const bob = connect('bob-socket');
    await bob.trigger('join-room', { roomId, userName: 'Bob' });

    bob.trigger('kick-user', { roomId, targetSocketId: 'alice-socket' });
    alice.trigger('kick-user', { roomId, targetSocketId: 'alice-socket' });
    assert.strictEqual(last(alice.emitted, 'kicked'), undefined);

    alice.trigger('kick-user', { roomId, targetSocketId: 'bob-socket' });
    assert.ok(last(bob.emitted, 'kicked'));
    assert.strictEqual(bob.disconnected, false);
    t.mock.timers.tick(500);
    assert.strictEqual(bob.disconnected, true);
});

test('disconnecting host hands host role to the next user', async () => {
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);
    const bob = connect('bob-socket');
    await bob.trigger('join-room', { roomId, userName: 'Bob' });

    await alice.trigger('disconnecting');

    assert.strictEqual(ctx.roomData[roomId].hostId, 'bob-socket');
    assert.deepStrictEqual(last(io.emitted, 'host-changed').data, { newHostId: 'bob-socket' });
    assert.strictEqual(last(alice.broadcasts, 'user-left').data, 'alice-socket');
    assert.deepStrictEqual(saved, []);
});

test('last user leaving saves the room and removes it from memory', async (t) => {
    t.mock.method(console, 'log', () => {});
    const alice = connect('alice-socket');
    const roomId = await createRoom(alice);

    await alice.trigger('disconnecting');

    assert.deepStrictEqual(saved, [roomId]);
    assert.strictEqual(ctx.roomData[roomId], undefined);
});
