// Lock feature: the host can make the room view-only, so only the host draws.
// The server drops drawing events from everyone else (see server.js); this file keeps
// the toolbar and the host's toggle in step. canDraw() lives in public/core.js.

const lockBtn   = document.getElementById('lockBtn');
const toolbarEl = document.querySelector('.toolbar');

function updateLockUI() {
    lockBtn.hidden = !amIHost;
    lockBtn.textContent = roomLocked ? '✏️ Let everyone draw' : '👁 Make view-only';
    toolbarEl.classList.toggle('locked', !canDraw());
    updateUndoRedoButtons();
}

lockBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('lock-room', { roomId: currentRoomId, locked: !roomLocked });
});

socket.on('room-locked', (data) => {
    roomLocked = Boolean(data && data.locked);
    if (!amIHost) showToast(roomLocked ? '👁 The host made the room view-only' : '✏️ Everyone can draw again');
    if (!canDraw() && isDrawing) {
        // a stroke in progress would never reach the server: drop it
        isDrawing = false;
        strokeOp = null;
        rebuildCanvas();
    }
    updateLockUI();
});

socket.on('room-created', () => { roomLocked = false; updateLockUI(); });
socket.on('room-joined', (data) => { roomLocked = Boolean(data && data.locked); updateLockUI(); });
// a new host can draw (and gets the toggle)
['users-update', 'host-changed'].forEach(event => socket.on(event, updateLockUI));
