function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomUserCount(io, roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
}

// browser id from localStorage, used only for kick bans
function parseClientId(data) {
    return (data && typeof data.clientId === 'string') ? data.clientId.substring(0, 64) : null;
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

    // Create a room
    socket.on('create-room', async (data) => {
        const roomId = generateRoomId();
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : session.currentName;
        session.currentName = uName;
        socket.data.clientId = parseClientId(data);

        socket.join(roomId);

        roomData[roomId] = {
            canvasState: null,
            undoStack: [],
            redoStack: [],
            pendingSnapshot: null,
            hostId: socket.id,
            users: {}
        };

        roomData[roomId].users[socket.id] = { name: uName, color: session.userColor };

        await persistence.ensureRoomDoc(roomId, socket.id, uName);

        const userCount = getRoomUserCount(io, roomId);
        socket.emit('room-created', {
            roomId, userCount, userColor: session.userColor, userName: uName, isHost: true
        });

        console.log(`🚪 Room created: ${roomId} by ${uName}`);
    });

    // Join a room
    socket.on('join-room', async (data) => {
        const roomId = (typeof data === 'string') ? data : data.roomId;
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : session.currentName;
        session.currentName = uName;
        socket.data.clientId = parseClientId(data);

        // roomData not in memory (fresh server or room was emptied) - try MongoDB before giving up
        if (!roomData[roomId]) {
            const dbRoom = await persistence.loadRoom(roomId);
            if (dbRoom) {
                roomData[roomId] = {
                    canvasState: dbRoom.canvasState || null,
                    undoStack: [],
                    redoStack: [],
                    pendingSnapshot: null,
                    // old hostId belonged to a socket that's long gone; joining user becomes host
                    hostId: socket.id,
                    users: {}
                };
                console.log(`♻️ Room ${roomId} restored from MongoDB`);
            }
        }

        const roomExists = io.sockets.adapter.rooms.has(roomId);
        if (!roomExists && !roomData[roomId]) {
            socket.emit('room-not-found', roomId);
            return;
        }

        const banned = roomData[roomId] && roomData[roomId].banned;
        if (banned && socket.data.clientId && banned.includes(socket.data.clientId)) {
            socket.emit('join-banned', roomId);
            return;
        }

        socket.join(roomId);

        if (!roomData[roomId]) {
            roomData[roomId] = {
                canvasState: null, undoStack: [], redoStack: [],
                pendingSnapshot: null, hostId: socket.id, users: {}
            };
        }

        roomData[roomId].users[socket.id] = { name: uName, color: session.userColor };

        const userCount = getRoomUserCount(io, roomId);
        const isHost    = roomData[roomId].hostId === socket.id;

        socket.emit('room-joined', {
            roomId, userCount, userColor: session.userColor, userName: uName,
            canvasState: roomData[roomId].canvasState,
            hasUndo: roomData[roomId].undoStack.length > 0,
            hasRedo: roomData[roomId].redoStack.length > 0,
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
    socket.on('kick-user', ({ roomId, targetSocketId }) => {
        if (!roomId || !roomData[roomId]) return;
        if (roomData[roomId].hostId !== socket.id) return;
        if (targetSocketId === socket.id) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) return;

        // ponytail: in-memory ban by browser id; lost when the room empties or the server restarts,
        // and bypassed by clearing localStorage. Real bans need user accounts.
        // same browser as the host (two tabs): skip, or the host would ban themselves
        if (targetSocket.data.clientId && targetSocket.data.clientId !== socket.data.clientId) {
            (roomData[roomId].banned ||= []).push(targetSocket.data.clientId);
        }

        targetSocket.emit('kicked');
        console.log(`✕ ${targetSocketId} kicked from room ${roomId} by host`);

        setTimeout(() => { targetSocket.disconnect(true); }, 500);
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

module.exports = { register, generateRoomId, getRoomUserCount, randomUserColor };
