// Minimal in-memory stand-ins for Socket.io's `io` and `socket`, used by the
// feature tests. They record what was emitted so tests can assert on it.

function createFakeIo() {
    const io = {
        sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
        emitted: [], // io.to(room).emit(...) -> { room, event, data }
        to(room) {
            return { emit: (event, data) => io.emitted.push({ room, event, data }) };
        }
    };
    return io;
}

function createFakeSocket(io, id) {
    const socket = {
        id,
        rooms: new Set([id]),
        data: {},
        handlers: {},
        emitted: [],    // socket.emit(...)          -> { event, data }
        broadcasts: [], // socket.to(room).emit(...) -> { room, event, data }
        disconnected: false,
        on(event, handler) { socket.handlers[event] = handler; },
        emit(event, data) { socket.emitted.push({ event, data }); },
        to(room) {
            return { emit: (event, data) => socket.broadcasts.push({ room, event, data }) };
        },
        join(room) {
            socket.rooms.add(room);
            if (!io.sockets.adapter.rooms.has(room)) io.sockets.adapter.rooms.set(room, new Set());
            io.sockets.adapter.rooms.get(room).add(id);
        },
        disconnect() { socket.disconnected = true; },
        // call a registered handler as if the client sent the event
        trigger(event, ...args) { return socket.handlers[event](...args); }
    };
    io.sockets.sockets.set(id, socket);
    return socket;
}

// last recorded entry for an event, or undefined
function last(list, event) {
    return list.filter(e => e.event === event).pop();
}

module.exports = { createFakeIo, createFakeSocket, last };
