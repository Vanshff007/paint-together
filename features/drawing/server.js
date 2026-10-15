const { inRoom } = require('../rooms/server');

function register(socket, ctx) {
    const { io, roomData } = ctx;

    // Relay stroke points, tagged with the sender so receivers keep strokes apart
    socket.on('draw', (data) => {
        if (data && inRoom(socket, data.roomId)) {
            socket.to(data.roomId).emit('draw', { ...data, socketId: socket.id });
        }
    });

    // Stroke finished; socketId tells receivers which user's layer to commit
    socket.on('mouseup', (roomId) => {
        if (inRoom(socket, roomId)) socket.to(roomId).emit('mouseup', { socketId: socket.id });
    });

    // Clear the canvas and the room history
    socket.on('clear', (roomId) => {
        if (inRoom(socket, roomId)) {
            socket.to(roomId).emit('clear');
            if (roomData[roomId]) {
                roomData[roomId].canvasState = null;
                delete roomData[roomId].history; // recreated empty (features/history)
                roomData[roomId].dirty       = true;
            }
            io.to(roomId).emit('history-update', { hasUndo: false, hasRedo: false });
        }
    });
}

module.exports = { register };
