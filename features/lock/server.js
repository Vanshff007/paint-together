const { inRoom } = require('../rooms/server');

// events that change the canvas; dropped from everyone but the host while the room is view-only
const DRAWING_EVENTS = new Set(['draw', 'mouseup', 'op', 'clear', 'undo', 'redo']);

// roomId of a payload: a bare string or { roomId }
function roomIdOf(data) {
    return typeof data === 'string' ? data : data && data.roomId;
}

function register(socket, ctx) {
    const { io, roomData } = ctx;

    // Socket.io middleware: runs before every handler, so the drawing features need no checks
    socket.use(([event, data], next) => {
        if (DRAWING_EVENTS.has(event)) {
            const room = roomData[roomIdOf(data)];
            if (room && room.locked && room.hostId !== socket.id) return; // dropped
        }
        next();
    });

    // host turns view-only mode on or off; everyone in the room is told
    socket.on('lock-room', (data) => {
        const roomId = data && data.roomId;
        if (!inRoom(socket, roomId) || !roomData[roomId]) return;
        if (roomData[roomId].hostId !== socket.id) return;
        roomData[roomId].locked = data.locked === true;
        roomData[roomId].dirty = true;
        io.to(roomId).emit('room-locked', { locked: roomData[roomId].locked });
    });
}

module.exports = { register, DRAWING_EVENTS };
