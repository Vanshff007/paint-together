require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./db');
const { createPersistence } = require('./features/persistence/server');
const rooms = require('./features/rooms/server');
const drawing = require('./features/drawing/server');
const history = require('./features/history/server');
const cursors = require('./features/cursors/server');
const chat = require('./features/chat/server');

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

// Serve only each feature's browser file; server code in features/ stays private
app.get('/features/:name([a-z]+)/client.js', (req, res) => {
    res.sendFile(`${req.params.name}/client.js`, { root: path.join(__dirname, 'features') }, (err) => {
        if (err && !res.headersSent) res.sendStatus(404);
    });
});

// Live room state, shared by all features (see docs/architecture.md)
const roomData = {};
const persistence = createPersistence(roomData);
persistence.startAutosave();

const ctx = { io, roomData, persistence };
const features = [rooms, drawing, history, cursors, chat];

io.on('connection', (socket) => {
    console.log('✅ New user connected! Socket ID:', socket.id);

    const session = {
        userColor: rooms.randomUserColor(),
        currentName: `User_${socket.id.substring(0, 4)}`
    };

    features.forEach(feature => feature.register(socket, ctx, session));
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
