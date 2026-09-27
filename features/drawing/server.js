function register(socket, ctx) {
    const { io, roomData } = ctx;

    //  DRAW and pata rhe konse user ne draw kia
    socket.on('draw', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('draw', { ...data, socketId: socket.id });
        }
    });

    socket.on('draw-shape', (data) => {
        if (data.roomId) socket.to(data.roomId).emit('draw-shape', data);
    });

    //  MOUSE UP
    // FIXED: include socketId so receiver clears correct user's drawing state
    socket.on('mouseup', (roomId) => {
        if (roomId) socket.to(roomId).emit('mouseup', { socketId: socket.id });
    });

    //  Clear krna
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
