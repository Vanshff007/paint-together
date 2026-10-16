const { inRoom } = require('../rooms/server');
const { isValidOp, cleanOp } = require('../tools/client');

// Per-user undo: a room's history is a base image plus a list of changes ("ops"), each
// tagged with the browser that made it. Undo hides that browser's last change; every
// client then redraws base + all changes that are not hidden.
const MAX_OPS       = 200; // changes kept as a list (undoable)
const COMPACT_COUNT = 100; // over MAX_OPS, the oldest this many are flattened into the base

// Only a PNG or WebP data URL may become canvas state. Browsers load it with img.src,
// so a URL would make every member fetch it, and a cross-origin image would taint the
// canvas so toDataURL() throws for the whole room.
function isCanvasDataUrl(state) {
    return typeof state === 'string' && /^data:image\/(png|webp);base64,/.test(state);
}

// who a change belongs to: the browser (clientId), so undo survives a reconnect
function authorKey(socket) {
    return socket.data.clientId || socket.id;
}

// baseState: image under all ops. redo: { authorKey: [op ids] }.
// compacting: { upTo, socketId } while one client flattens the oldest ops.
function newHistory(baseState = null) {
    return { baseState, ops: [], nextId: 1, redo: {}, compacting: null };
}

// lazily created; a room restored from MongoDB starts from its saved canvas
function historyOf(room) {
    return (room.history ||= newHistory(room.canvasState || null));
}

// ops waiting to be flattened cannot be undone or redone (the new base must match them)
function locked(h, id) {
    return Boolean(h.compacting) && id <= h.compacting.upTo;
}

function stateFor(h, key) {
    return {
        hasUndo: h.ops.some(o => o.author === key && !o.undone && !locked(h, o.id)),
        hasRedo: (h.redo[key] || []).some(id => !locked(h, id) && h.ops.some(o => o.id === id && o.undone))
    };
}

// what clients see of an op: never the author key (a browser id)
function publicOp(entry) {
    return { id: entry.id, undone: entry.undone, ...entry.op };
}

function register(socket, ctx) {
    const { io, roomData } = ctx;
    const roomOf = (roomId) => inRoom(socket, roomId) && roomData[roomId];

    // each member gets its own Undo/Redo state
    function sendHistoryState(roomId) {
        const h = historyOf(roomData[roomId]);
        Object.keys(roomData[roomId].users).forEach(sid => {
            const member = io.sockets.sockets.get(sid);
            if (member) member.emit('history-update', stateFor(h, authorKey(member)));
        });
    }

    // too many ops: ask this client (just sent one, so it is up to date) to flatten the oldest
    function maybeCompact(roomId) {
        const h = historyOf(roomData[roomId]);
        if (h.ops.length <= MAX_OPS) return;
        if (h.compacting && io.sockets.sockets.get(h.compacting.socketId)) return; // already asked
        const upTo = h.ops[COMPACT_COUNT - 1].id;
        h.compacting = { upTo, socketId: socket.id };
        socket.emit('compact-request', { upTo });
    }

    // full history, asked by the client after every join (also after a reconnect)
    socket.on('history-sync', (roomId) => {
        const room = roomOf(roomId);
        if (!room) return;
        const h = historyOf(room);
        socket.emit('history-sync', {
            baseState: h.baseState,
            ops: h.ops.map(publicOp),
            ...stateFor(h, authorKey(socket))
        });
    });

    // a finished change: stored, sent to everyone (the sender skips drawing it again).
    // The full canvas comes separately (canvas-state) once the sender pauses; an old
    // client may still send it here as `state`.
    socket.on('op', (data) => {
        const { roomId, op, state } = data || {};
        const room = roomOf(roomId);
        if (!room || !isValidOp(op)) return;
        const h = historyOf(room);
        const key = authorKey(socket);
        const entry = { id: h.nextId++, author: key, undone: false, op: cleanOp(op) };
        h.ops.push(entry);
        h.redo[key] = []; // a new change ends this user's redo
        if (isCanvasDataUrl(state)) room.canvasState = state;
        room.dirty = true;
        io.to(roomId).emit('op', { ...publicOp(entry), by: socket.id });
        maybeCompact(roomId);
        sendHistoryState(roomId);
    });

    // hide the sender's last visible change; clients redraw, the sender then sends canvas-state
    socket.on('undo', (roomId) => {
        const room = roomOf(roomId);
        if (!room) return;
        const h = historyOf(room);
        const key = authorKey(socket);
        const entry = [...h.ops].reverse().find(o => o.author === key && !o.undone && !locked(h, o.id));
        if (!entry) return;
        entry.undone = true;
        (h.redo[key] ||= []).push(entry.id);
        io.to(roomId).emit('op-undone', { id: entry.id, by: socket.id });
        sendHistoryState(roomId);
    });

    socket.on('redo', (roomId) => {
        const room = roomOf(roomId);
        if (!room) return;
        const h = historyOf(room);
        const stack = h.redo[authorKey(socket)] || [];
        while (stack.length) {
            const id = stack.pop();
            const entry = h.ops.find(o => o.id === id && o.undone);
            if (!entry || locked(h, id)) continue;
            entry.undone = false;
            io.to(roomId).emit('op-redone', { id, by: socket.id });
            break;
        }
        sendHistoryState(roomId);
    });

    // the full canvas after a pause in changes or an undo/redo, from the user who made it, for autosave
    socket.on('canvas-state', (data) => {
        const { roomId, state } = data || {};
        const room = roomOf(roomId);
        if (!room || !isCanvasDataUrl(state)) return;
        room.canvasState = state;
        room.dirty = true;
    });

    // reply to compact-request: base + the oldest ops (up to upTo) as one image
    socket.on('compact', (data) => {
        const { roomId, upTo, state } = data || {};
        const room = roomOf(roomId);
        if (!room || !isCanvasDataUrl(state)) return;
        const h = historyOf(room);
        if (!h.compacting || h.compacting.upTo !== upTo || h.compacting.socketId !== socket.id) return;
        h.baseState = state;
        h.ops = h.ops.filter(o => o.id > upTo);
        Object.keys(h.redo).forEach(k => { h.redo[k] = h.redo[k].filter(id => id > upTo); });
        h.compacting = null;
        socket.to(roomId).emit('history-compacted', { upTo, baseState: state });
        sendHistoryState(roomId);
    });
}

module.exports = {
    register, newHistory, historyOf, isCanvasDataUrl, authorKey,
    MAX_OPS, COMPACT_COUNT
};
