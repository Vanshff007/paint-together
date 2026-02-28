// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomUserCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
}

// roomData structure:
// {
//   canvasState, undoStack, redoStack, pendingSnapshot,
//   hostId: socketId of room creator,
//   users: { socketId: { name, color } }
// }
const roomData = {};
const MAX_HISTORY = 30;

function randomUserColor() {
    const colors = [
        '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);

    const userColor = randomUserColor();
    let currentRoom = null;
    let currentName = `User_${socket.id.substring(0, 4)}`;

    // ── CREATE ROOM ──────────────────────────────────────
    socket.on('create-room', (data) => {
        const roomId = generateRoomId();
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : currentName;
        currentName  = uName;

        socket.join(roomId);
        currentRoom = roomId;

        roomData[roomId] = {
            canvasState: null,
            undoStack: [],
            redoStack: [],
            pendingSnapshot: null,
            hostId: socket.id,          // creator is host
            users: {}
        };

        roomData[roomId].users[socket.id] = { name: uName, color: userColor };

        const userCount = getRoomUserCount(roomId);
        socket.emit('room-created', {
            roomId, userCount, userColor, userName: uName,
            isHost: true
        });

        console.log(`🚪 Room created: ${roomId} by ${uName}`);
    });

    // ── JOIN ROOM ────────────────────────────────────────
    socket.on('join-room', (data) => {
        const roomId = (typeof data === 'string') ? data : data.roomId;
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : currentName;
        currentName  = uName;

        const roomExists = io.sockets.adapter.rooms.has(roomId);
        if (!roomExists && !roomData[roomId]) {
            socket.emit('room-not-found', roomId);
            return;
        }

        socket.join(roomId);
        currentRoom = roomId;

        if (!roomData[roomId]) {
            roomData[roomId] = {
                canvasState: null, undoStack: [], redoStack: [],
                pendingSnapshot: null, hostId: socket.id, users: {}
            };
        }

        roomData[roomId].users[socket.id] = { name: uName, color: userColor };

        const userCount = getRoomUserCount(roomId);
        const isHost    = roomData[roomId].hostId === socket.id;

        socket.emit('room-joined', {
            roomId, userCount, userColor, userName: uName,
            canvasState: roomData[roomId].canvasState,
            hasUndo: roomData[roomId].undoStack.length > 0,
            hasRedo: roomData[roomId].redoStack.length > 0,
            isHost,
            hostId: roomData[roomId].hostId
        });

        io.to(roomId).emit('user-count-update', userCount);
        // Send full user list to everyone so member panel stays in sync
        io.to(roomId).emit('users-update', {
            users: roomData[roomId].users,
            hostId: roomData[roomId].hostId
        });
        socket.to(roomId).emit('user-joined', { socketId: socket.id, name: uName, color: userColor });

        console.log(`🚪 ${uName} joined room: ${roomId} | Users: ${userCount}`);
    });

    // ── DRAW ─────────────────────────────────────────────
    socket.on('draw', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('draw', data);
    });

    socket.on('draw-shape', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('draw-shape', data);
    });

    // ── UNDO/REDO SNAPSHOTS ──────────────────────────────
    socket.on('save-undo-snapshot', ({ roomId, state }) => {
        if (!roomId || !roomData[roomId]) return;
        roomData[roomId].pendingSnapshot = state;
        roomData[roomId].redoStack = [];
    });

    socket.on('discard-undo-snapshot', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        roomData[roomId].pendingSnapshot = null;
    });

    socket.on('stroke-complete', ({ roomId, state }) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.pendingSnapshot !== null && room.pendingSnapshot !== undefined) {
            room.undoStack.push(room.pendingSnapshot);
            if (room.undoStack.length > MAX_HISTORY) room.undoStack.shift();
            room.pendingSnapshot = null;
        }
        room.canvasState = state;
        io.to(roomId).emit('history-update', {
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // ── CLEAR ────────────────────────────────────────────
    socket.on('clear', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('clear');
            if (roomData[roomId]) {
                roomData[roomId].canvasState = null;
                roomData[roomId].undoStack   = [];
                roomData[roomId].redoStack   = [];
            }
            io.to(roomId).emit('history-update', { hasUndo: false, hasRedo: false });
        }
    });

    // ── UNDO ─────────────────────────────────────────────
    socket.on('undo', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.undoStack.length === 0) return;
        if (room.canvasState) room.redoStack.push(room.canvasState);
        const previousState = room.undoStack.pop();
        room.canvasState = previousState;
        io.to(roomId).emit('canvas-restore', {
            state: previousState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // ── REDO ─────────────────────────────────────────────
    socket.on('redo', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.redoStack.length === 0) return;
        if (room.canvasState) room.undoStack.push(room.canvasState);
        const nextState = room.redoStack.pop();
        room.canvasState = nextState;
        io.to(roomId).emit('canvas-restore', {
            state: nextState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // ── MOUSE UP ─────────────────────────────────────────
    socket.on('mouseup', (roomId) => {
        if (roomId) socket.to(roomId).emit('mouseup');
    });

    // ── CURSOR ───────────────────────────────────────────
    socket.on('cursor-move', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('cursor-move', {
                socketId: socket.id,
                x: data.x,
                y: data.y,
                color: userColor,
                name: currentName      // always use latest name from join
            });
        }
    });

    socket.on('cursor-leave', (roomId) => {
        if (roomId) socket.to(roomId).emit('cursor-hide', socket.id);
    });

    // ── CHAT ─────────────────────────────────────────────
    socket.on('chat-message', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('chat-message', {
                author: data.author,
                text: data.text
            });
        }
    });

    // ── KICK (host only) ─────────────────────────────────
    socket.on('kick-user', ({ roomId, targetSocketId }) => {
        if (!roomId || !roomData[roomId]) return;
        // Only host can kick
        if (roomData[roomId].hostId !== socket.id) return;
        // Can't kick yourself
        if (targetSocketId === socket.id) return;

        // Get the target socket instance
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) return;

        // Tell the kicked user they've been kicked first, then disconnect them
        targetSocket.emit('kicked');
        console.log(`✕ ${targetSocketId} kicked from room ${roomId} by host`);

        // Force disconnect after a delay so the client receives the 'kicked' event first
        setTimeout(() => {
            targetSocket.disconnect(true);
        }, 500);
    });

    // ── DISCONNECT ───────────────────────────────────────
    socket.on('disconnecting', () => {
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomId => {
            if (roomId === socket.id) return;

            const currentCount = getRoomUserCount(roomId);
            const newCount     = currentCount - 1;

            if (roomData[roomId] && roomData[roomId].users) {
                delete roomData[roomId].users[socket.id];
            }

            socket.to(roomId).emit('user-count-update', newCount);
            socket.to(roomId).emit('cursor-hide', socket.id);
            socket.to(roomId).emit('user-left', socket.id);

            // If host left, assign new host
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
                // Still send updated user list
                io.to(roomId).emit('users-update', {
                    users: roomData[roomId].users,
                    hostId: roomData[roomId].hostId
                });
            }

            if (newCount <= 0 && roomData[roomId]) {
                delete roomData[roomId];
                console.log(`🗑️ Room ${roomId} cleaned up (empty)`);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log('===========================================');
    console.log('🚀 SERVER STARTED SUCCESSFULLY!');
    console.log(`📡 Running at: http://localhost:${PORT}`);
    console.log('🔌 Socket.io ready for real-time drawing!');
    console.log('===========================================');
});