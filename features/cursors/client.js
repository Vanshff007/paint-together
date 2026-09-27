// Cursors feature: shows other users' live cursors on the canvas.

// DOM ELEMENTS
const cursorOverlay = document.getElementById('cursorOverlay');

// REMOTE CURSORS

const remoteCursors = {};

socket.on('cursor-move', (data) => {
    let cx, cy;
    if (data.nx !== undefined) {
        const p = fromNorm(data.nx, data.ny);
        cx = p.x; cy = p.y;
    } else {
        cx = data.x; cy = data.y;
    }
    updateRemoteCursor(data.socketId, cx, cy, data.color, data.name);
});

socket.on('cursor-hide', (socketId) => removeCursor(socketId));

// REMOTE CURSORS
function ensureCursorExists(socketId, color, name) {
    if (remoteCursors[socketId]) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'remote-cursor';
    wrapper.style.display = 'none';

    const dot = document.createElement('div');
    dot.className = 'remote-cursor-dot';
    dot.style.background = color;

    const label = document.createElement('div');
    label.className = 'remote-cursor-label';
    label.style.background = color;
    label.textContent = name;

    wrapper.appendChild(dot);
    wrapper.appendChild(label);
    cursorOverlay.appendChild(wrapper);
    remoteCursors[socketId] = { element: wrapper, dot, label };
}

function updateRemoteCursor(socketId, x, y, color, name) {
    ensureCursorExists(socketId, color, name);
    const cursor = remoteCursors[socketId];

    // overlay and canvas ko aalign kra
    const pctX = (x / canvas.width)  * 100;
    const pctY = (y / canvas.height) * 100;

    cursor.element.style.left    = `${pctX}%`;
    cursor.element.style.top     = `${pctY}%`;
    cursor.element.style.display = 'block';
    cursor.label.textContent      = name;
    cursor.label.style.background = color;
    cursor.dot.style.background   = color;
}

function removeCursor(socketId) {
    if (remoteCursors[socketId]) {
        remoteCursors[socketId].element.remove();
        delete remoteCursors[socketId];
    }
    if (remoteLayerState[socketId]) {
        // Commit any in-progress stroke before removing
        if (remoteLayerState[socketId].drawing) {
            ctx.drawImage(remoteLayerState[socketId].canvas, 0, 0);
            canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        remoteLayerState[socketId].ctx.clearRect(0, 0,
            remoteLayerState[socketId].canvas.width,
            remoteLayerState[socketId].canvas.height);
        delete remoteLayerState[socketId];
    }
}
