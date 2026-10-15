const { inRoom } = require('../rooms/server');

const MAX_MESSAGE_LENGTH = 200;

function register(socket, ctx, session) {

    // Chatting; the author is the sender's server-side name, never taken from the client
    socket.on('chat-message', (data) => {
        if (data && inRoom(socket, data.roomId) && typeof data.text === 'string') {
            const text = data.text.trim().substring(0, MAX_MESSAGE_LENGTH);
            if (!text) return;
            socket.to(data.roomId).emit('chat-message', {
                author: session.currentName,
                text
            });
        }
    });
}

module.exports = { register, MAX_MESSAGE_LENGTH };
