function register(socket, ctx) {
    const { io, roomData } = ctx;

    // Relay stroke points, tagged with the sender so receivers keep strokes apart
    socket.on('draw', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('draw', { ...data, socketId: socket.id });
        }
    });

    socket.on('draw-shape', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('draw-shape', data);
    });

    // Stroke finished; socketId tells receivers which user's layer to commit
    socket.on('mouseup', (roomId) => {
        if (roomId) socket.to(roomId).emit('mouseup', { socketId: socket.id });
    });

    // Clear the canvas and the room history
    socket.on('clear', (roomId) => {
        if (roomId) {
            socket.to(roomId).emit('clear');
            if (roomData[roomId]) {
                roomData[roomId].canvasState = null;
                roomData[roomId].undoStack   = [];
                roomData[roomId].redoStack   = [];
            }
            io.to(roomId).emit('history-update', { hasUndo: false, hasRedo: false });
        }
    });
}

module.exports = { register };
