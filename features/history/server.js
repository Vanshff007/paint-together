const { inRoom } = require('../rooms/server');

const MAX_HISTORY = 30;

// Only a PNG data URL may become canvas state. Browsers load it with img.src, so a URL
// would make every member fetch it, and a cross-origin image would taint the canvas
// so toDataURL() throws for the whole room.
function isPngDataUrl(state) {
    return typeof state === 'string' && state.startsWith('data:image/png;base64,');
}

function register(socket, ctx) {
    const { io, roomData } = ctx;

    // Canvas before a stroke starts; becomes an undo step on stroke-complete
    socket.on('save-undo-snapshot', (data) => {
        const { roomId, state } = data || {};
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        if (state !== null && !isPngDataUrl(state)) return;
        roomData[roomId].pendingSnapshot = state;
        roomData[roomId].redoStack = [];
    });

    socket.on('discard-undo-snapshot', (roomId) => {
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        roomData[roomId].pendingSnapshot = null;
    });

    socket.on('stroke-complete', (data) => {
        const { roomId, state } = data || {};
        if (!inRoom(socket, roomId) || !roomData[roomId] || !isPngDataUrl(state)) return;
        const room = roomData[roomId];
        if (room.pendingSnapshot !== null && room.pendingSnapshot !== undefined) {
            room.undoStack.push(room.pendingSnapshot);
            if (room.undoStack.length > MAX_HISTORY) room.undoStack.shift();
            room.pendingSnapshot = null;
        }
        room.canvasState = state;
        room.dirty = true;
        io.to(roomId).emit('history-update', {
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // Undo
    socket.on('undo', (roomId) => {
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.undoStack.length === 0) return;
        if (room.canvasState) room.redoStack.push(room.canvasState);
        const previousState = room.undoStack.pop();
        room.canvasState = previousState;
        room.dirty = true;
        io.to(roomId).emit('canvas-restore', {
            state: previousState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });

    // Redo
    socket.on('redo', (roomId) => {
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        const room = roomData[roomId];
        if (room.redoStack.length === 0) return;
        if (room.canvasState) room.undoStack.push(room.canvasState);
        const nextState = room.redoStack.pop();
        room.canvasState = nextState;
        room.dirty = true;
        io.to(roomId).emit('canvas-restore', {
            state: nextState,
            hasUndo: room.undoStack.length > 0,
            hasRedo: room.redoStack.length > 0
        });
    });
}

module.exports = { register, MAX_HISTORY, isPngDataUrl };
