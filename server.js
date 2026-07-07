require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./db');
const Room = require('./models/Room');

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

const roomData = {};
const MAX_HISTORY = 30;
const AUTOSAVE_INTERVAL_MS = 30 * 1000;

//  Mongo persistence helper - only ever writes the latest canvasState,
//  never called from draw/mousemove/cursor events
async function saveRoomState(roomId) {
    const room = roomData[roomId];
    if (!room) return;
    try {
        await Room.findOneAndUpdate(
            { roomId },
            {
                $set: {
                    canvasState: room.canvasState,
                    hostId: room.hostId,
                    users: Object.values(room.users).map(u => u.name),
                    updatedAt: new Date(),
                    lastSavedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );
    } catch (err) {
        console.error(`❌ Failed to save room ${roomId} to MongoDB:`, err);
    }
}

//  Autosave: every 30s, persist only the latest canvasState per active room
setInterval(() => {
    Object.keys(roomData).forEach(roomId => {
        saveRoomState(roomId);
    });
}, AUTOSAVE_INTERVAL_MS);

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

    //  rooom banane ke liye
    socket.on('create-room', async (data) => {
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
            hostId: socket.id,
            users: {}
        };

        roomData[roomId].users[socket.id] = { name: uName, color: userColor };

        // create the MongoDB document for this room if it doesn't exist yet
        try {
            const existing = await Room.findOne({ roomId });
            if (!existing) {
                await Room.create({
                    roomId,
                    canvasState: null,
                    hostId: socket.id,
                    users: [uName]
                });
            }
        } catch (err) {
            console.error(`❌ Failed to create MongoDB document for room ${roomId}:`, err);
        }

        const userCount = getRoomUserCount(roomId);
        socket.emit('room-created', {
            roomId, userCount, userColor, userName: uName, isHost: true
        });

        console.log(`🚪 Room created: ${roomId} by ${uName}`);
    });

    //  join room
    socket.on('join-room', async (data) => {
        const roomId = (typeof data === 'string') ? data : data.roomId;
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : currentName;
        currentName  = uName;

        // roomData not in memory (fresh server or room was emptied) - try MongoDB before giving up
        if (!roomData[roomId]) {
            try {
                const dbRoom = await Room.findOne({ roomId });
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
            } catch (err) {
                console.error(`❌ Failed to restore room ${roomId} from MongoDB:`, err);
            }
        }

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
        io.to(roomId).emit('users-update', {
            users: roomData[roomId].users,
            hostId: roomData[roomId].hostId
        });
        socket.to(roomId).emit('user-joined', { socketId: socket.id, name: uName, color: userColor });

        // har user ko cursor dena
        const existingUsers = {};
        Object.entries(roomData[roomId].users).forEach(([sid, info]) => {
            if (sid !== socket.id) existingUsers[sid] = info;
        });
        socket.emit('existing-users', existingUsers);

        console.log(`🚪 ${uName} joined room: ${roomId} | Users: ${userCount}`);
    });

    //  DRAW and pata rhe konse user ne draw kia
    socket.on('draw', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('draw', { ...data, socketId: socket.id });
        }
    });

    socket.on('draw-shape', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('draw-shape', data);
    });

    //  undo redo ki state save krne ke liye
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

    //  Clear krna  
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

    //  Undo
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

    //  redo ke liye
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

    //  MOUSE UP 
    // FIXED: include socketId so receiver clears correct user's drawing state
    socket.on('mouseup', (roomId) => {
        if (roomId) socket.to(roomId).emit('mouseup', { socketId: socket.id });
    });

    //  Cursor dono ko dikhe move hote hue
    socket.on('cursor-move', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('cursor-move', {
                socketId: socket.id,
                nx: data.nx,
                ny: data.ny,
                x: data.x,
                y: data.y,
                color: userColor,
                name: currentName
            });
        }
    });

    socket.on('cursor-leave', (roomId) => {
        if (roomId) socket.to(roomId).emit('cursor-hide', socket.id);
    });

    // Chatting
    socket.on('chat-message', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('chat-message', {
                author: data.author,
                text: data.text
            });
        }
    });

    // Kick krne ke liye
    socket.on('kick-user', ({ roomId, targetSocketId }) => {
        if (!roomId || !roomData[roomId]) return;
        if (roomData[roomId].hostId !== socket.id) return;
        if (targetSocketId === socket.id) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (!targetSocket) return;

        targetSocket.emit('kicked');
        console.log(`✕ ${targetSocketId} kicked from room ${roomId} by host`);

        setTimeout(() => { targetSocket.disconnect(true); }, 500);
    });

    // when disconnecting
    socket.on('disconnecting', async () => {
        const rooms = Array.from(socket.rooms);
        for (const roomId of rooms) {
            if (roomId === socket.id) continue;

            const currentCount = getRoomUserCount(roomId);
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
                await saveRoomState(roomId);
                delete roomData[roomId];
                console.log(`🗑️ Room ${roomId} cleaned up (empty)`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});
// to start the server and check if tis working or not
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log('===========================================');
        console.log('🚀 SERVER STARTED SUCCESSFULLY!');
        console.log(`📡 Running at: http://localhost:${PORT}`);
        console.log('🔌 Socket.io ready for real-time drawing!');
        console.log('===========================================');
    });
});