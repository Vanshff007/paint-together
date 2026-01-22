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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);
    console.log('👥 Total users:', io.engine.clientsCount);
    
    // Listen for drawing data from client
    socket.on('draw', (data) => {
        // Broadcast to all other users (not the sender)
        socket.broadcast.emit('draw', data);
    });
    
    // Listen for clear canvas event
    socket.on('clear', () => {
        // Broadcast to all other users
        socket.broadcast.emit('clear');
    });
    
    // Listen for mouse up event
    socket.on('mouseup', () => {
        socket.broadcast.emit('mouseup');
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