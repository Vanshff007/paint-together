function register(socket, ctx, session) {

    // Show this user's cursor to the others in the room
    socket.on('cursor-move', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('cursor-move', {
                socketId: socket.id,
                nx: data.nx,
                ny: data.ny,
                x: data.x,
                y: data.y,
                color: session.userColor,
                name: session.currentName
            });
        }
    });

    socket.on('cursor-leave', (roomId) => {
        if (roomId) socket.to(roomId).emit('cursor-hide', socket.id);
    });
}

module.exports = { register };
