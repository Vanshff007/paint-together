require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./features/persistence/db');
const { createPersistence } = require('./features/persistence/server');
const rooms = require('./features/rooms/server');
const drawing = require('./features/drawing/server');
const history = require('./features/history/server');
const cursors = require('./features/cursors/server');
const chat = require('./features/chat/server');
const { allowRequest } = require('./features/origin/server');
const ratelimit = require('./features/ratelimit/server');
const lock = require('./features/lock/server');

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

// Builds the app without starting it. RoomModel is injectable so browser tests
// (e2e/) can run with an in-memory model instead of MongoDB.
function createServer(RoomModel) {
    const app = express();
    const server = http.createServer(app);
    // only pages from this host may connect (see features/origin/README.md).
    // 10 MB per message: a full 1280x800 canvas can be ~6 MB as base64 PNG (default limit is 1 MB)
    const io = socketIo(server, { allowRequest, maxHttpBufferSize: MAX_MESSAGE_BYTES });

    app.use(express.static(path.join(__dirname, 'public')));
    // robots.txt, llms.txt, sitemap.xml, icons, og-image.png at the site root
    app.use(express.static(path.join(__dirname, 'features', 'seo', 'static')));
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
    const persistence = createPersistence(roomData, RoomModel);

    const ctx = { io, roomData, persistence };
    // ratelimit first: its socket.use() middleware must see every event; lock's runs next
    const features = [ratelimit, lock, rooms, drawing, history, cursors, chat];

    io.on('connection', (socket) => {
        console.log('✅ New user connected! Socket ID:', socket.id);

        const session = {
            userColor: rooms.randomUserColor(),
            currentName: `User_${socket.id.substring(0, 4)}`
        };

        // safety net: a handler error is logged, never crashes the whole server
        const on = socket.on.bind(socket);
        socket.on = (event, handler) => on(event, (...args) => {
            const logError = (err) => console.error(`❌ Error in '${event}' handler:`, err);
            try {
                Promise.resolve(handler(...args)).catch(logError);
            } catch (err) {
                logError(err);
            }
        });

        features.forEach(feature => feature.register(socket, ctx, session));
    });

    return { server, io, roomData, persistence, ctx };
}

// Start listening only after MongoDB is connected (only when run directly, not when required)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    const { server, persistence } = createServer();
    persistence.startAutosave();
    connectDB().then(() => {
        server.listen(PORT, () => {
            console.log('===========================================');
            console.log('🚀 SERVER STARTED SUCCESSFULLY!');
            console.log(`📡 Running at: http://localhost:${PORT}`);
            console.log('🔌 Socket.io ready for real-time drawing!');
            console.log('===========================================');
        });
    });
}

module.exports = { createServer, MAX_MESSAGE_BYTES };
