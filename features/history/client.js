// History feature: undo/redo. Offline: local ImageData stacks. In a room: per-user undo,
// with the room's history (base image + list of changes) mirrored from the server.

// DOM ELEMENTS
const undoBtn           = document.getElementById('undoBtn');
const redoBtn           = document.getElementById('redoBtn');

// UNDO/REDO STATE
let localUndoStack = [];
let localRedoStack = [];
const MAX_LOCAL_HISTORY = 30;
let serverHasUndo = false;
let serverHasRedo = false;

// ROOM HISTORY
// The canvas is the base image plus every change ("op", see features/tools isValidOp)
// that is not undone, drawn in order. This mirrors the server's list.

let roomHistory    = { base: null, ops: [] };
let historyVersion = 0;         // bumped on every change to roomHistory
const opImages     = new Map(); // op id -> Promise of the decoded picture (image ops)

function resetRoomHistory(base = null, ops = []) {
    roomHistory = { base, ops };
    opImages.clear();
    historyVersion++;
}

// Draw onto the committed image (below in-progress remote strokes), then show those again
function drawOnCommitted(drawFn) {
    if (canvasImage) ctx.putImageData(canvasImage, 0, 0);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFn(ctx);
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    compositeRemoteLayers();
}

function loadImage(src) {
    return new Promise(resolve => {
        if (typeof src !== 'string' || !src.startsWith('data:image/')) return resolve(null);
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function imageFor(op) {
    if (!opImages.has(op.id)) opImages.set(op.id, loadImage(op.src));
    return opImages.get(op.id);
}

// base + visible ops with id <= upTo, drawn onto a new canvas
async function renderHistory(upTo = Infinity) {
    const { base, ops } = roomHistory;
    const visible = ops.filter(o => !o.undone && o.id <= upTo);
    const [baseImage, ...images] = await Promise.all([
        base ? loadImage(base) : null,
        ...visible.map(o => (o.shape === 'image' ? imageFor(o) : null))
    ]);
    const off = document.createElement('canvas');
    off.width  = canvas.width;
    off.height = canvas.height;
    const c = off.getContext('2d', { willReadFrequently: true });
    if (baseImage) c.drawImage(baseImage, 0, 0, off.width, off.height);
    visible.forEach((op, i) => drawOp(c, op, off.width, off.height, images[i]));
    return off;
}

// Redraw the canvas from the history. If the history changes while images load,
// draw again. Resolves to the rendered canvas, or null if a newer rebuild took over.
let rebuildCount = 0;
async function rebuildCanvas() {
    const mine = ++rebuildCount;
    let off, version;
    do {
        version = historyVersion;
        off = await renderHistory();
        if (mine !== rebuildCount) return null;
    } while (version !== historyVersion);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    compositeRemoteLayers();
    return off;
}

// after this user's undo/redo: the redrawn canvas goes to the server (autosave, joiners)
function rebuildAndReport(by) {
    rebuildCanvas().then(off => {
        if (off && by === socket.id && currentRoomId) {
            socket.emit('canvas-state', { roomId: currentRoomId, state: off.toDataURL(canvasStateType, 1) });
        }
    });
}

function requestHistorySync() {
    if (currentRoomId) socket.emit('history-sync', currentRoomId);
}

function setServerHistoryState(data) {
    serverHasUndo = Boolean(data.hasUndo);
    serverHasRedo = Boolean(data.hasRedo);
    updateUndoRedoButtons();
}

socket.on('history-sync', (data) => {
    if (!data || !Array.isArray(data.ops)) return;
    resetRoomHistory(data.baseState || null, data.ops.filter(isValidOp));
    setServerHistoryState(data);
    rebuildCanvas();
});

socket.on('history-update', setServerHistoryState);

// a new change in the room. The sender and (for strokes) everyone who watched it live
// already drew it; shapes from others are drawn now.
socket.on('op', (op) => {
    if (!op || !isValidOp(op)) return;
    roomHistory.ops.push(op);
    historyVersion++;
    if (op.by === socket.id || op.type === 'stroke') return;
    if (op.shape === 'image') {
        imageFor(op).then(img => drawOnCommitted(c => drawOp(c, op, canvas.width, canvas.height, img)));
    } else {
        drawOnCommitted(c => drawOp(c, op, canvas.width, canvas.height));
    }
});

socket.on('op-undone', (data) => {
    const op = data && roomHistory.ops.find(o => o.id === data.id);
    if (!op) return;
    op.undone = true;
    historyVersion++;
    rebuildAndReport(data.by);
});

socket.on('op-redone', (data) => {
    const op = data && roomHistory.ops.find(o => o.id === data.id);
    if (!op) return;
    op.undone = false;
    historyVersion++;
    rebuildAndReport(data.by);
});

// the server asks this client to flatten the oldest changes into one image
socket.on('compact-request', (data) => {
    if (!data || !currentRoomId) return;
    const roomId = currentRoomId;
    renderHistory(data.upTo).then(off => {
        socket.emit('compact', { roomId, upTo: data.upTo, state: off.toDataURL(canvasStateType, 1) });
    });
});

socket.on('history-compacted', (data) => {
    if (!data) return;
    roomHistory.base = data.baseState;
    roomHistory.ops  = roomHistory.ops.filter(o => o.id > data.upTo);
    historyVersion++;
});

// clear resets the room history (features/drawing)
socket.on('clear', () => resetRoomHistory());

// BUTTONS (keyboard shortcuts live in features/shortcuts)
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// UNDO/REDO

function saveToUndoStack() {
    if (currentRoomId) return;
    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    localUndoStack.push(state);
    if (localUndoStack.length > MAX_LOCAL_HISTORY) localUndoStack.shift();
    localRedoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (currentRoomId) {
        socket.emit('undo', currentRoomId);
    } else {
        if (localUndoStack.length === 0) return;
        localRedoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const prev = localUndoStack.pop();
        ctx.putImageData(prev, 0, 0);
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        updateUndoRedoButtons();
    }
}

function redo() {
    if (currentRoomId) {
        socket.emit('redo', currentRoomId);
    } else {
        if (localRedoStack.length === 0) return;
        localUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const next = localRedoStack.pop();
        ctx.putImageData(next, 0, 0);
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    if (currentRoomId) {
        undoBtn.disabled = !serverHasUndo;
        redoBtn.disabled = !serverHasRedo;
    } else {
        undoBtn.disabled = localUndoStack.length === 0;
        redoBtn.disabled = localRedoStack.length === 0;
    }
}
