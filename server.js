// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

console.log('Step 1: Modules imported');

// Create Express app
const app = express();

// Create HTTP server (needed for Socket.io)
const server = http.createServer(app);

// Create Socket.io instance
const io = socketIo(server);

console.log('Step 2: Server and Socket.io created');

// Define port
const PORT = 3000;

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Route: Send index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log('Step 3: Routes configured');

// Function to generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// Function to get user count in a room
function getRoomUserCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);
    console.log('👥 Total users:', io.engine.clientsCount);
    
    // Track which room this socket is in
    let currentRoom = null;
    
    // Handle create room request
    socket.on('create-room', () => {
        const roomId = generateRoomId();
        socket.join(roomId);
        currentRoom = roomId;
        
        const userCount = getRoomUserCount(roomId);
        socket.emit('room-created', { roomId, userCount });
        
        console.log(`🚪 Room created: ${roomId} by ${socket.id}`);
    });
    
    // Handle join room request
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        currentRoom = roomId;
        
        const userCount = getRoomUserCount(roomId);
        socket.emit('room-joined', { roomId, userCount });
        
        // Notify everyone in room about updated user count
        io.to(roomId).emit('user-count-update', userCount);
        
        console.log(`🚪 User ${socket.id} joined room: ${roomId}`);
        console.log(`👥 Users in room ${roomId}: ${userCount}`);
    });
    
    // Listen for drawing data from client
    socket.on('draw', (data) => {
        // Broadcast to room
        if (data.roomId) {
            socket.to(data.roomId).emit('draw', data);
        }
    });
    
    // Listen for clear canvas event
    socket.on('clear', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('clear');
        }
    });
    
    // Listen for mouse up event
    socket.on('mouseup', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('mouseup');
        }
    });
    
    // When user is disconnecting (BEFORE leaving rooms)
    socket.on('disconnecting', () => {
        console.log('⚠️ User disconnecting! Socket ID:', socket.id);
        console.log('Current room tracked:', currentRoom);
        console.log('Socket.rooms:', Array.from(socket.rooms));
        
        // Get all rooms this socket is in
        const rooms = Array.from(socket.rooms);
        
        rooms.forEach(roomId => {
            // Skip the socket's own ID room
            if (roomId !== socket.id) {
                console.log(`Processing room: ${roomId}`);
                
                // Get current count and subtract 1
                const currentCount = getRoomUserCount(roomId);
                const newCount = currentCount - 1;
                
                console.log(`Room ${roomId}: ${currentCount} -> ${newCount}`);
                
                // Notify others
                socket.to(roomId).emit('user-count-update', newCount);
            }
        });
    });
    
    // When user has disconnected
    socket.on('disconnect', () => {
        console.log('❌ User fully disconnected! Socket ID:', socket.id);
    });
});

console.log('Step 4: Socket.io listeners configured');

// Start server
server.listen(PORT, () => {
    console.log('===========================================');
    console.log('🚀 SERVER STARTED SUCCESSFULLY!');
    console.log(`📡 Server running at: http://localhost:${PORT}`);
    console.log('🔌 Socket.io is ready for real-time drawing!');
    console.log('Press Ctrl+C to stop');
    console.log('===========================================');
});