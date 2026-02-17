// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Create Express app
const app = express();

// Create HTTP server (needed for Socket.io)
const server = http.createServer(app);

// Create Socket.io instance
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Define port — uses environment variable for Render, falls back to 3000 locally
const PORT = process.env.PORT || 3000;

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Route: Send index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Function to get user count in a room
function getRoomUserCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
}

// Store room data per room:
// {
//   canvasState: base64string,       — current canvas (shown to new joiners)
//   undoStack:   [base64, ...],      — shared undo history (max 30)
//   redoStack:   [base64, ...],      — shared redo history
//   users:       { socketId: { name, color } }
// }
const roomData = {};
const MAX_HISTORY = 30;

// Generate a random color for a user's cursor
function randomUserColor() {
    const colors = [
        '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);

    // Assign this user a random color for their cursor
    const userColor = randomUserColor();
    const userName = `User_${socket.id.substring(0, 4)}`;

    // Track which room this socket is in
    let currentRoom = null;

    // Handle create room request
    socket.on('create-room', (data) => {
        const roomId  = generateRoomId();
        const name    = (data && data.userName) ? data.userName.trim().substring(0, 20) : `User_${socket.id.substring(0,4)}`;
        const uName   = name || `User_${socket.id.substring(0,4)}`;

        socket.join(roomId);
        currentRoom = roomId;

        roomData[roomId] = {
            canvasState: null,
            undoStack: [],
            redoStack: [],
            pendingSnapshot: null,
            users: {}
        };

        roomData[roomId].users[socket.id] = { name: uName, color: userColor };

        const userCount = getRoomUserCount(roomId);
        socket.emit('room-created', { roomId, userCount, userColor, userName: uName });

        console.log(`🚪 Room created: ${roomId} by ${uName}`);
    });

    // Handle join room request
    socket.on('join-room', (data) => {
        const roomId = (typeof data === 'string') ? data : data.roomId;
        const uName  = (data && data.userName) ? data.userName.trim().substring(0, 20) : `User_${socket.id.substring(0,4)}`;

        const roomExists = io.sockets.adapter.rooms.has(roomId);
        if (!roomExists && !roomData[roomId]) {
            socket.emit('room-not-found', roomId);
            return;
        }

        socket.join(roomId);
        currentRoom = roomId;

        if (!roomData[roomId]) {
            roomData[roomId] = { canvasState: null, undoStack: [], redoStack: [], pendingSnapshot: null, users: {} };
        }

        roomData[roomId].users[socket.id] = { name: uName, color: userColor };

        const userCount = getRoomUserCount(roomId);

        socket.emit('room-joined', {
            roomId,
            userCount,
            userColor,
            userName: uName,
            canvasState: roomData[roomId].canvasState,
            hasUndo: roomData[roomId].undoStack.length > 0,
            hasRedo: roomData[roomId].redoStack.length > 0
        });

        io.to(roomId).emit('user-count-update', userCount);
        socket.emit('existing-users', roomData[roomId].users);
        socket.to(roomId).emit('user-joined', { socketId: socket.id, name: uName, color: userColor });

        console.log(`🚪 ${uName} joined room: ${roomId} | Users: ${userCount}`);
    });

    // Listen for drawing data — broadcast to room
    socket.on('draw', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('draw', data);
        }
    });

    // Client signals: "I'm about to draw — save current canvas as undo snapshot"
    socket.on('save-undo-snapshot', ({ roomId, state }) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];

        // Push current state onto undo stack
        room.pendingSnapshot = state; // hold it until stroke-complete confirms it
        room.redoStack = []; // new stroke invalidates redo
    });

    // Client signals: "I clicked but didn't draw — discard the snapshot"
    socket.on('discard-undo-snapshot', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        roomData[roomId].pendingSnapshot = null;
    });

    // Client signals: "Stroke is complete — commit snapshot and update current state"
    socket.on('stroke-complete', ({ roomId, state }) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];

        // Commit the pending snapshot to undoStack
        if (room.pendingSnapshot !== null && room.pendingSnapshot !== undefined) {
            room.undoStack.push(room.pendingSnapshot);
            if (room.undoStack.length > MAX_HISTORY) room.undoStack.shift();
            room.pendingSnapshot = null;
        }

        // Update current canvas state
        room.canvasState = state;

        // Tell ALL clients in room to update button states
        io.to(roomId).emit('history-update', {
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // Listen for clear canvas event
    socket.on('clear', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('clear');
            // Clear saved canvas state and history
            if (roomData[roomId]) {
                roomData[roomId].canvasState = null;
                roomData[roomId].undoStack = [];
                roomData[roomId].redoStack = [];
            }
            // Tell all clients undo/redo is now disabled
            io.to(roomId).emit('history-update', { hasUndo: false, hasRedo: false });
        }
    });

    // Any user requests UNDO — server pops shared stack and broadcasts to ALL
    socket.on('undo', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.undoStack.length === 0) return;

        // Push current state to redo stack
        if (room.canvasState) {
            room.redoStack.push(room.canvasState);
        }

        // Pop previous state from undo stack
        const previousState = room.undoStack.pop();
        room.canvasState = previousState;

        // Broadcast new canvas state to ALL users in room (including sender)
        io.to(roomId).emit('canvas-restore', {
            state: previousState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });

        console.log(`↩ Undo in room ${roomId} | undoStack: ${room.undoStack.length} | redoStack: ${room.redoStack.length}`);
    });

    // Any user requests REDO — server pops redo stack and broadcasts to ALL
    socket.on('redo', (roomId) => {
        if (!roomId || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.redoStack.length === 0) return;

        // Push current state to undo stack
        if (room.canvasState) {
            room.undoStack.push(room.canvasState);
        }

        // Pop next state from redo stack
        const nextState = room.redoStack.pop();
        room.canvasState = nextState;

        // Broadcast new canvas state to ALL users in room (including sender)
        io.to(roomId).emit('canvas-restore', {
            state: nextState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });

        console.log(`↪ Redo in room ${roomId} | undoStack: ${room.undoStack.length} | redoStack: ${room.redoStack.length}`);
    });

    // Listen for mouse up event
    socket.on('mouseup', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('mouseup');
        }
    });

    // Live cursor position — broadcast to room
    socket.on('cursor-move', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('cursor-move', {
                socketId: socket.id,
                x: data.x,
                y: data.y,
                color: userColor,
                name: userName
            });
        }
    });

    // Cursor left canvas
    socket.on('cursor-leave', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('cursor-hide', socket.id);
        }
    });

    // When user is disconnecting
    socket.on('disconnecting', () => {
        const rooms = Array.from(socket.rooms);

        rooms.forEach(roomId => {
            if (roomId !== socket.id) {
                const currentCount = getRoomUserCount(roomId);
                const newCount = currentCount - 1;

                // Remove user from room data
                if (roomData[roomId] && roomData[roomId].users) {
                    delete roomData[roomId].users[socket.id];
                }

                // Notify others
                socket.to(roomId).emit('user-count-update', newCount);
                socket.to(roomId).emit('cursor-hide', socket.id);
                socket.to(roomId).emit('user-left', socket.id);

                // Clean up empty rooms
                if (newCount <= 0 && roomData[roomId]) {
                    delete roomData[roomId];
                    console.log(`🗑️ Room ${roomId} cleaned up (empty)`);
                }
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});

// Start server
server.listen(PORT, () => {
    console.log('===========================================');
    console.log('🚀 SERVER STARTED SUCCESSFULLY!');
    console.log(`📡 Running at: http://localhost:${PORT}`);
    console.log('🔌 Socket.io ready for real-time drawing!');
    console.log('===========================================');
});