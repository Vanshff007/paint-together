function register(socket) {

    // Chatting
    socket.on('chat-message', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('chat-message', {
                author: data.author,
                text: data.text
            });
        }
    });
}

module.exports = { register };
