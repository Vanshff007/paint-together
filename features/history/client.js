// History feature: undo/redo (local when offline, server-side when in a room).

// DOM ELEMENTS
const undoBtn           = document.getElementById('undoBtn');
const redoBtn           = document.getElementById('redoBtn');

// UNDO/REDO STATE
let localUndoStack = [];
let localRedoStack = [];
const MAX_LOCAL_HISTORY = 30;
let serverHasUndo = false;
let serverHasRedo = false;


socket.on('canvas-restore', (data) => {
    loadCanvasState(data.state);
    serverHasUndo = data.hasUndo;
    serverHasRedo = data.hasRedo;
    updateUndoRedoButtons();
});

socket.on('history-update', (data) => {
    serverHasUndo = data.hasUndo;
    serverHasRedo = data.hasRedo;
    updateUndoRedoButtons();
});

// BUTTONS AND SHORTCUTS
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z')  { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault(); redo();
    }
});

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
