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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);
    console.log('👥 Total users:', io.engine.clientsCount);
    
    // Handle create room request
    socket.on('create-room', () => {
        const roomId = generateRoomId();
        socket.join(roomId);
        socket.emit('room-created', roomId);
        console.log(`🚪 Room created: ${roomId} by ${socket.id}`);
    });
    
    // Handle join room request
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.emit('room-joined', roomId);
        
        // Get room info
        const room = io.sockets.adapter.rooms.get(roomId);
        const userCount = room ? room.size : 0;
        
        console.log(`🚪 User ${socket.id} joined room: ${roomId}`);
        console.log(`👥 Users in room ${roomId}: ${userCount}`);
        
        // Notify others in the room
        socket.to(roomId).emit('user-joined', userCount);
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
    
    // When user disconnects
    socket.on('disconnect', () => {
        console.log('❌ User disconnected! Socket ID:', socket.id);
        console.log('👥 Total users:', io.engine.clientsCount);
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