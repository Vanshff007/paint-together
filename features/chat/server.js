const { inRoom } = require('../rooms/server');

const MAX_MESSAGE_LENGTH = 200;
const MAX_CHAT_HISTORY = 50;

function register(socket, ctx, session) {
    const { roomData } = ctx;

    // Chatting; the author is the sender's server-side name, never taken from the client
    socket.on('chat-message', (data) => {
        if (data && inRoom(socket, data.roomId) && typeof data.text === 'string') {
            const text = data.text.trim().substring(0, MAX_MESSAGE_LENGTH);
            if (!text) return;
            const message = { author: session.currentName, text };
            socket.to(data.roomId).emit('chat-message', message);

            // in-memory history for late joiners; clientId marks the sender's own messages
            const room = roomData[data.roomId];
            if (room) {
                const history = (room.chat ||= []);
                history.push({ ...message, clientId: socket.data.clientId });
                if (history.length > MAX_CHAT_HISTORY) history.shift();
            }
        }
    });

    // Client asks after joining; clientId never leaves the server, only an `own` flag
    socket.on('chat-history', (roomId) => {
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        const myId = socket.data.clientId;
        socket.emit('chat-history', (roomData[roomId].chat || []).map(m => ({
            author: m.author,
            text: m.text,
            own: Boolean(myId) && m.clientId === myId
        })));
    });
}

module.exports = { register, MAX_MESSAGE_LENGTH, MAX_CHAT_HISTORY };
