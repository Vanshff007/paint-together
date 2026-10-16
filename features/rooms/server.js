const { parsePassword, hashPassword, checkPassword, clientIp, createLimiter } = require('../passwords/server');

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomUserCount(io, roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
}

// true only for a string roomId this socket has joined; guards every room-scoped event
function inRoom(socket, roomId) {
    return typeof roomId === 'string' && socket.rooms.has(roomId);
}

// trimmed name, max 20 chars; fallback when missing, empty, or not a string
function parseName(data, fallback) {
    const name = (data && typeof data.userName === 'string') ? data.userName.trim().substring(0, 20) : '';
    return name || fallback;
}

// browser id from localStorage (kick bans, undo owner, known members). Letters, digits and
// dashes only: it becomes a key in the saved history, and MongoDB keys cannot hold '.' or '$'.
function parseClientId(data) {
    const id = (data && typeof data.clientId === 'string') ? data.clientId.substring(0, 64) : '';
    return /^[A-Za-z0-9-]+$/.test(id) ? id : null;
}

const MAX_MEMBERS = 500;          // browsers remembered per room
const IP_BAN_MS   = 60 * 60 * 1000; // a kick also blocks new browsers from that IP for 1 hour

// true if this browser got into the room before (it skips the password and IP bans)
function isMember(room, clientId) {
    return Boolean(clientId) && (room.members || []).includes(clientId);
}

// ponytail: plain list, oldest dropped past MAX_MEMBERS; a Set if rooms ever get big
function addMember(room, clientId) {
    if (!clientId || isMember(room, clientId)) return;
    const members = (room.members ||= []);
    members.push(clientId);
    if (members.length > MAX_MEMBERS) members.shift();
    room.dirty = true;
}

// a kicked browser, or a new browser from the IP of someone kicked within the last hour
function isBanned(room, clientId, ip) {
    if (clientId && (room.banned || []).includes(clientId)) return true;
    if (isMember(room, clientId)) return false;
    return (room.bannedIps || []).some(b => b.ip === ip && b.until > Date.now());
}

function randomUserColor() {
    const colors = [
        '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// session = per-socket state shared with other features: { userColor, currentName }
function register(socket, ctx, session) {
    const { io, roomData, persistence } = ctx;
    // one wrong-password limiter per server (ctx), so tests get a fresh one
    const limiter = (ctx.passwordLimiter ||= createLimiter());

    // Create a room
    socket.on('create-room', async (data) => {
        const uName  = parseName(data, session.currentName);
        session.currentName = uName;
        socket.data.clientId = parseClientId(data);
        const password = parsePassword(data);
        const passwordHash = password ? await hashPassword(password) : null;

        // skip IDs used by a live room or a saved one
        let roomId = generateRoomId();
        while (roomData[roomId] || await persistence.loadRoom(roomId)) roomId = generateRoomId();

        socket.join(roomId);

        roomData[roomId] = {
            canvasState: null,
            hostId: socket.id,
            users: {},
            passwordHash
        };

        roomData[roomId].users[socket.id] = { name: uName, color: session.userColor };
        addMember(roomData[roomId], socket.data.clientId);

        await persistence.ensureRoomDoc(roomId, socket.id, uName, passwordHash);

        const userCount = getRoomUserCount(io, roomId);
        socket.emit('room-created', {
            roomId, userCount, userColor: session.userColor, userName: uName, isHost: true
        });

        console.log(`🚪 Room created: ${roomId} by ${uName}`);
    });

    // Join a room
    socket.on('join-room', async (data) => {
        const roomId = (typeof data === 'string') ? data : (data && data.roomId);
        if (typeof roomId !== 'string') return;
        const uName  = parseName(data, session.currentName);
        session.currentName = uName;
        socket.data.clientId = parseClientId(data);

        // roomData not in memory (fresh server or room was emptied) - try MongoDB before giving up
        if (!roomData[roomId]) {
            const dbRoom = await persistence.loadRoom(roomId);
            // another joiner may have restored it while we waited; keep theirs
            if (dbRoom && !roomData[roomId]) {
                roomData[roomId] = {
                    canvasState: dbRoom.canvasState || null,
                    // old hostId belonged to a socket that's long gone; the first user who gets in becomes host
                    hostId: null,
                    users: {},
                    passwordHash: dbRoom.passwordHash || null,
                    chat: (dbRoom.chat || []).map(m => ({ author: m.author, text: m.text })),
                    members: [...(dbRoom.members || [])],
                    banned: [...(dbRoom.banned || [])],
                    bannedIps: (dbRoom.bannedIps || []).map(b => ({ ip: b.ip, until: Number(b.until) }))
                };
                // undo/redo history (features/history), if it was small enough to save
                if (dbRoom.history) roomData[roomId].history = { ...dbRoom.history, compacting: null };
                console.log(`♻️ Room ${roomId} restored from MongoDB`);
            }
        }

        const roomExists = io.sockets.adapter.rooms.has(roomId);
        if (!roomExists && !roomData[roomId]) {
            socket.emit('room-not-found', roomId);
            return;
        }

        const ip = clientIp(socket);
        if (roomData[roomId] && isBanned(roomData[roomId], socket.data.clientId, ip)) {
            socket.emit('join-banned', roomId);
            return;
        }

        // password-protected room: check the password, with a wrong-guess limit per IP.
        // A browser that got in before skips it, so a forgotten password never locks the room.
        const passwordHash = roomData[roomId] && roomData[roomId].passwordHash;
        if (passwordHash && !isMember(roomData[roomId], socket.data.clientId)) {
            const wait = limiter.waitFor(ip);
            if (wait) {
                socket.emit('join-password', { roomId, reason: 'wait', retryIn: Math.ceil(wait / 1000) });
                return;
            }
            const password = parsePassword(data);
            if (!(await checkPassword(password, passwordHash))) {
                if (password) limiter.fail(ip);
                socket.emit('join-password', { roomId, reason: password ? 'wrong' : 'required' });
                return;
            }
            limiter.reset(ip);
            // the room may have emptied and left memory while the hash was checked
            if (!roomData[roomId]) {
                socket.emit('room-not-found', roomId);
                return;
            }
        }

        socket.join(roomId);

        if (!roomData[roomId]) {
            roomData[roomId] = {
                canvasState: null, hostId: socket.id, users: {}
            };
        }

        // restored room (no host yet), or a host that is gone: this user becomes host
        if (!roomData[roomId].users[roomData[roomId].hostId]) roomData[roomId].hostId = socket.id;
        roomData[roomId].users[socket.id] = { name: uName, color: session.userColor };
        addMember(roomData[roomId], socket.data.clientId);

        const userCount = getRoomUserCount(io, roomId);
        const isHost    = roomData[roomId].hostId === socket.id;

        socket.emit('room-joined', {
            roomId, userCount, userColor: session.userColor, userName: uName,
            canvasState: roomData[roomId].canvasState,
            isHost,
            hostId: roomData[roomId].hostId
        });

        io.to(roomId).emit('user-count-update', userCount);
        io.to(roomId).emit('users-update', {
            users: roomData[roomId].users,
            hostId: roomData[roomId].hostId
        });
        socket.to(roomId).emit('user-joined', { socketId: socket.id, name: uName, color: session.userColor });

        // Send the joiner the other users so it can show their cursors
        const existingUsers = {};
        Object.entries(roomData[roomId].users).forEach(([sid, info]) => {
            if (sid !== socket.id) existingUsers[sid] = info;
        });
        socket.emit('existing-users', existingUsers);

        console.log(`🚪 ${uName} joined room: ${roomId} | Users: ${userCount}`);
    });

    // Host removes a user
    socket.on('kick-user', (data) => {
        const { roomId, targetSocketId } = data || {};
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        if (roomData[roomId].hostId !== socket.id) return;
        if (targetSocketId === socket.id) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) return;

        // ponytail: bans by browser id plus a 1-hour IP ban for new browsers, saved with the room.
        // A new IP (mobile data, VPN) still gets around them. Real bans need user accounts.
        const room = roomData[roomId];
        const targetId = targetSocket.data.clientId;
        // same browser as the host (two tabs): no ban, or the host would ban themselves
        if (!(targetId && targetId === socket.data.clientId)) {
            if (targetId) {
                (room.banned ||= []).push(targetId);
                if (room.members) room.members = room.members.filter(id => id !== targetId);
            }
            // members already in from that IP (same school or home) are not affected
            const now = Date.now();
            room.bannedIps = (room.bannedIps || []).filter(b => b.until > now);
            room.bannedIps.push({ ip: clientIp(targetSocket), until: now + IP_BAN_MS });
            room.dirty = true;
        }

        targetSocket.emit('kicked');
        console.log(`✕ ${targetSocketId} kicked from room ${roomId} by host`);

        setTimeout(() => { targetSocket.disconnect(true); }, 500);
    });

    // Host sets a new room password, or removes it with an empty one
    socket.on('set-password', async (data) => {
        const roomId = data && data.roomId;
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        if (roomData[roomId].hostId !== socket.id) return;
        const password = parsePassword(data);
        const hash = password ? await hashPassword(password) : null;
        if (!roomData[roomId]) return;
        roomData[roomId].passwordHash = hash;
        roomData[roomId].dirty = true;
        socket.emit('password-set', { locked: Boolean(hash) });
    });

    // Leave rooms: update members, hand over host, save and clean up empty rooms
    socket.on('disconnecting', async () => {
        const rooms = Array.from(socket.rooms);
        for (const roomId of rooms) {
            if (roomId === socket.id) continue;

            const currentCount = getRoomUserCount(io, roomId);
            const newCount     = currentCount - 1;

            if (roomData[roomId] && roomData[roomId].users) {
                delete roomData[roomId].users[socket.id];
            }

            socket.to(roomId).emit('user-count-update', newCount);
            socket.to(roomId).emit('cursor-hide', socket.id);
            socket.to(roomId).emit('user-left', socket.id);

            if (roomData[roomId] && roomData[roomId].hostId === socket.id) {
                const remainingUsers = Object.keys(roomData[roomId].users);
                if (remainingUsers.length > 0) {
                    roomData[roomId].hostId = remainingUsers[0];
                    io.to(roomId).emit('host-changed', { newHostId: remainingUsers[0] });
                    io.to(roomId).emit('users-update', {
                        users: roomData[roomId].users,
                        hostId: roomData[roomId].hostId
                    });
                }
            } else if (roomData[roomId]) {
                io.to(roomId).emit('users-update', {
                    users: roomData[roomId].users,
                    hostId: roomData[roomId].hostId
                });
            }

            if (newCount <= 0 && roomData[roomId]) {
                // persist the final canvasState before dropping the in-memory copy
                await persistence.saveRoomState(roomId);
                // someone may have joined while the save was in flight; keep the room then
                if (roomData[roomId] && Object.keys(roomData[roomId].users).length === 0) {
                    delete roomData[roomId];
                    console.log(`🗑️ Room ${roomId} cleaned up (empty)`);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
}

module.exports = { register, inRoom, generateRoomId, getRoomUserCount, randomUserColor, IP_BAN_MS, MAX_MEMBERS };
