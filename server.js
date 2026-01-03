const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

console.log('Step 1: Modules imported');

const app = express();

const server = http.createServer(app);

const io = socketIo(server);

console.log('Step 2: Server and Socket.io created');

const PORT = 3000;
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log('Step 3: Routes configured');
io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);
        socket.on('disconnect', () => {
        console.log('❌ User disconnected! Socket ID:', socket.id);
    });
});

console.log('Step 4: Socket.io listeners configured');

server.listen(PORT, () => {
    console.log('===========================================');
    console.log('🚀 SERVER STARTED SUCCESSFULLY!');
    console.log(`📡 Server running at: http://localhost:${PORT}`);
    console.log('🔌 Socket.io is ready for connections!');
    console.log('Press Ctrl+C to stop');
    console.log('===========================================');
});