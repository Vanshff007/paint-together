// Drawing feature: canvas, tools, colors, remote stroke layers, mouse/touch input.

// DOM ELEMENTS
const brushBtn          = document.getElementById('brushBtn');
const eraserBtn         = document.getElementById('eraserBtn');
const colorPalette      = document.getElementById('colorPalette');
const customColorBtn    = document.getElementById('customColorBtn');
const colorPickerModal  = document.getElementById('colorPickerModal');
const colorPicker       = document.getElementById('colorPicker');
const colorPickerOk     = document.getElementById('colorPickerOk');
const colorPickerCancel = document.getElementById('colorPickerCancel');
const brushSize         = document.getElementById('brushSize');
const brushSizeValue    = document.getElementById('brushSizeValue');
const clearBtn          = document.getElementById('clearBtn');
const downloadBtn       = document.getElementById('downloadBtn');

// COLOR PALETTE
const defaultColors = [
    '#000000', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF',
    '#C0C0C0', '#FFFFFF', '#00FF80', '#80FFFF', '#8080FF', '#FF0080', '#FF8040'
];

let selectedColorElement = null;
let paletteInitialized   = false;
let currentColor         = '#000000';

function initColorPalette() {
    if (paletteInitialized) return;
    paletteInitialized = true;

    defaultColors.forEach((color, index) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.background = color;
        swatch.dataset.color = color;
        if (index === 0) {
            swatch.classList.add('active');
            selectedColorElement = swatch;
        }
        swatch.addEventListener('click', () => {
            customColorBtn.classList.remove('active');
            selectColor(color, swatch);
        });
        colorPalette.appendChild(swatch);
    });

    customColorBtn.addEventListener('click', () => {
        colorPicker.value = currentColor;
        colorPickerModal.classList.add('show');
    });

    colorPickerOk.addEventListener('click', () => {
        const pickedColor = colorPicker.value;
        selectColor(pickedColor, null);
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        customColorBtn.classList.add('active');
        customColorBtn.style.background = pickedColor;
        customColorBtn.style.color = getBrightness(pickedColor) > 128 ? '#000000' : '#ffffff';
        colorPickerModal.classList.remove('show');
    });

    colorPickerCancel.addEventListener('click', () => colorPickerModal.classList.remove('show'));
    colorPickerModal.addEventListener('click', (e) => {
        if (e.target === colorPickerModal) colorPickerModal.classList.remove('show');
    });
}

function selectColor(color, element) {
    currentColor = color;
    if (selectedColorElement && selectedColorElement !== customColorBtn) {
        selectedColorElement.classList.remove('active');
    }
    if (element) {
        element.classList.add('active');
        selectedColorElement = element;
        customColorBtn.style.background = '';
        customColorBtn.style.color = '';
    }
}

function getBrightness(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

// DRAWING STATE

let isDrawing        = false;
let hasDrawnInStroke = false;
let currentBrushSize = 5;
let currentTool      = 'brush';
let lastX = 0, lastY = 0;
let canvasImage      = null;
let mouseX = 0, mouseY = 0;
let showCursor       = false;


// This completely isolates remote strokes from each other and from local drawing.

const remoteLayerState = {};

function getRemoteLayer(socketId) {
    if (!remoteLayerState[socketId]) {
        const offscreen = document.createElement('canvas');
        offscreen.width  = canvas.width;
        offscreen.height = canvas.height;
        const offCtx = offscreen.getContext('2d');
        remoteLayerState[socketId] = {
            canvas: offscreen,
            ctx: offCtx,
            drawing: false,
            lastX: 0,
            lastY: 0
        };
    }
    return remoteLayerState[socketId];
}

// Resize all remote layers when main canvas resizes
function resizeRemoteLayers(w, h) {
    Object.values(remoteLayerState).forEach(layer => {
        // Snapshot, resize, redraw
        const snap = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        layer.canvas.width  = w;
        layer.canvas.height = h;
        // Don't restore snap — on resize strokes are lost anyway (same as main canvas)
    });
}

// Composite all remote layers onto the main canvas on top of committed pixels
function compositeRemoteLayers() {
    // Start from committed state
    if (canvasImage) {
        ctx.putImageData(canvasImage, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    // Draw each active remote layer on top
    Object.values(remoteLayerState).forEach(layer => {
        if (layer.drawing) {
            ctx.drawImage(layer.canvas, 0, 0);
        }
    });
}

// DRAW EVENT — FIX: use per-user state via socketId

socket.on('draw', (data) => {
    let rx, ry, rsize;
    if (data.nx !== undefined) {
        const p = fromNorm(data.nx, data.ny);
        rx = p.x; ry = p.y;
        rsize = denormSize(data.ns);
    } else {
        rx = data.x; ry = data.y; rsize = data.size;
    }
    // data.socketId tells us exactly which remote user sent this stroke
    drawReceivedLine(data.socketId, rx, ry, data.color, rsize, data.tool, data.isStart);
});

socket.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    // Also clear all remote layers
    Object.values(remoteLayerState).forEach(layer => {
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.drawing = false;
    });
    showToast('🗑️ Canvas cleared');
});

// FIX: mouseup — commit the remote user's offscreen layer into canvasImage, then clear it
socket.on('mouseup', (data) => {
    const sid = data && data.socketId;

    if (sid && remoteLayerState[sid] && remoteLayerState[sid].drawing) {
        // Flatten committed pixels + this user's completed stroke into one image
        //    Start from latest committed state
        if (canvasImage) {
            ctx.putImageData(canvasImage, 0, 0);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        // Draw all OTHER still-active remote layers on top
        Object.entries(remoteLayerState).forEach(([id, layer]) => {
            if (id !== sid && layer.drawing) ctx.drawImage(layer.canvas, 0, 0);
        });
        // Draw the completed stroke on top
        ctx.drawImage(remoteLayerState[sid].canvas, 0, 0);

        // Commit everything as the new baseline
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Mark this layer as done and clear its offscreen canvas
        remoteLayerState[sid].drawing = false;
        remoteLayerState[sid].ctx.clearRect(0, 0, remoteLayerState[sid].canvas.width, remoteLayerState[sid].canvas.height);
    }

    // Layer is now cleaned up above
});

// TOOLBAR

brushBtn.addEventListener('click', () => {
    currentTool = 'brush';
    brushBtn.classList.add('active');
    eraserBtn.classList.remove('active');
    canvas.style.cursor = 'crosshair';
    restoreCanvas();
});

eraserBtn.addEventListener('click', () => {
    currentTool = 'eraser';
    eraserBtn.classList.add('active');
    brushBtn.classList.remove('active');
    canvas.style.cursor = 'none';
});

brushSize.addEventListener('input', (e) => {
    currentBrushSize = e.target.value;
    brushSizeValue.textContent = `${currentBrushSize}px`;
    if (currentTool === 'eraser' && showCursor) showCursorPreview();
});

clearBtn.addEventListener('click', () => {
    if (!currentRoomId) saveToUndoStack();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    if (currentRoomId) {
        socket.emit('clear', currentRoomId);
    } else {
        localRedoStack = [];
        updateUndoRedoButtons();
    }
});

downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    const date = new Date();
    const ts   = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${date.getHours()}${date.getMinutes()}${date.getSeconds()}`;
    link.download = `paint-together-${ts}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

function loadCanvasState(base64) {
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    img.src = base64;
}

// CANVAS RESIZE

function syncCanvasResolution() {
    const rect     = canvas.getBoundingClientRect();
    const displayW = Math.floor(rect.width);
    const displayH = Math.floor(rect.height);

    // Skip if canvas has no size yet (not visible / not in DOM)
    if (displayW <= 0 || displayH <= 0) return;
    if (canvas.width === displayW && canvas.height === displayH) return;

    const snapshot = canvas.width > 0 && canvas.height > 0
        ? ctx.getImageData(0, 0, canvas.width, canvas.height)
        : null;

    canvas.width  = displayW;
    canvas.height = displayH;
    resizeRemoteLayers(displayW, displayH);

    if (snapshot) {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width  = snapshot.width;
        tmpCanvas.height = snapshot.height;
        tmpCanvas.getContext('2d').putImageData(snapshot, 0, 0);
        ctx.drawImage(tmpCanvas, 0, 0, displayW, displayH);
        canvasImage = ctx.getImageData(0, 0, displayW, displayH);
    }
}

window.addEventListener('load', syncCanvasResolution);
const canvasResizeObserver = new ResizeObserver(() => syncCanvasResolution());
canvasResizeObserver.observe(canvas);

// COORDINATES

function getMousePos(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top)  * scaleY
    };
}

function getTouchPos(touch) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top)  * scaleY
    };
}

function toNorm(x, y)     { return { nx: x / canvas.width, ny: y / canvas.height }; }
function fromNorm(nx, ny) { return { x: nx * canvas.width,  y: ny * canvas.height }; }
function normSize(size)   { return size / canvas.width; }
function denormSize(ns)   { return ns   * canvas.width; }

// EVENT EMITTER THROTTLE

let lastEmitTime = 0;
const EMIT_THROTTLE = 30;

// MOUSE EVENTS

canvas.addEventListener('mousedown', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    startDrawing(e);
});
canvas.addEventListener('mousemove', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    handleMouseMove(e);
});
canvas.addEventListener('mouseup', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    stopDrawing();
});
canvas.addEventListener('mouseout', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    stopDrawing();
    showCursor = false;
    restoreCanvas();
    if (currentRoomId) socket.emit('cursor-leave', currentRoomId);
});
canvas.addEventListener('mouseenter', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    showCursor = true;
    if (currentTool === 'eraser') showCursorPreview();
});

function handleMouseMove(e) {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    if (isDrawing) {
        draw(e);
    } else if (currentTool === 'eraser' && showCursor) {
        showCursorPreview();
    }
    if (currentRoomId) {
        const now = Date.now();
        if (now - lastEmitTime > EMIT_THROTTLE) {
            const _nc = toNorm(pos.x, pos.y);
            socket.emit('cursor-move', { roomId: currentRoomId, nx: _nc.nx, ny: _nc.ny });
            lastEmitTime = now;
        }
    }
}

// TOUCH EVENTS

let activeTouchId = null;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (activeTouchId !== null) return;
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    const pos = getTouchPos(t);
    hasDrawnInStroke = false;
    isDrawing  = true;
    lastX = pos.x; lastY = pos.y;
    mouseX = pos.x; mouseY = pos.y;
    restoreCanvas();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth   = currentBrushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    if (!currentRoomId) {
        saveToUndoStack();
    } else {
        socket.emit('save-undo-snapshot', { roomId: currentRoomId, state: canvas.toDataURL('image/png') });
        const _n = toNorm(pos.x, pos.y);
        socket.emit('draw', { nx: _n.nx, ny: _n.ny, color: currentColor, ns: normSize(currentBrushSize), tool: currentTool, isStart: true, roomId: currentRoomId });
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === activeTouchId);
    if (!t) return;
    const pos = getTouchPos(t);
    mouseX = pos.x; mouseY = pos.y;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    hasDrawnInStroke = true;
    lastX = pos.x; lastY = pos.y;
    if (currentRoomId) {
        const _n = toNorm(pos.x, pos.y);
        socket.emit('draw', { nx: _n.nx, ny: _n.ny, color: currentColor, ns: normSize(currentBrushSize), tool: currentTool, roomId: currentRoomId });
        const now = Date.now();
        if (now - lastEmitTime > EMIT_THROTTLE) {
            socket.emit('cursor-move', { roomId: currentRoomId, nx: _n.nx, ny: _n.ny });
            lastEmitTime = now;
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === activeTouchId);
    if (!t) return;
    activeTouchId = null;
    stopDrawing();
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === activeTouchId);
    if (!t) return;
    activeTouchId = null;
    stopDrawing();
}, { passive: false });

// DRAWING FUNCTIONS

function startDrawing(e) {
    hasDrawnInStroke = false;
    isDrawing  = true;
    const pos  = getMousePos(e);
    lastX = pos.x; lastY = pos.y;
    restoreCanvas();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth   = currentBrushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    if (!currentRoomId) {
        saveToUndoStack();
    } else {
        socket.emit('save-undo-snapshot', { roomId: currentRoomId, state: canvas.toDataURL('image/png') });
        const _n = toNorm(pos.x, pos.y);
        socket.emit('draw', { nx: _n.nx, ny: _n.ny, color: currentColor, ns: normSize(currentBrushSize), tool: currentTool, isStart: true, roomId: currentRoomId });
    }
}

function draw(e) {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    hasDrawnInStroke = true;
    lastX = pos.x; lastY = pos.y;
    if (currentRoomId) {
        const _n = toNorm(pos.x, pos.y);
        socket.emit('draw', { nx: _n.nx, ny: _n.ny, color: currentColor, ns: normSize(currentBrushSize), tool: currentTool, roomId: currentRoomId });
    }
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (!hasDrawnInStroke) {
        if (currentRoomId) {
            socket.emit('discard-undo-snapshot', currentRoomId);
        } else {
            localUndoStack.pop();
            updateUndoRedoButtons();
        }
        return;
    }
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (currentRoomId) {
        socket.emit('mouseup', currentRoomId);
        socket.emit('stroke-complete', { roomId: currentRoomId, state: canvas.toDataURL('image/png') });
    }
    if (currentTool === 'eraser' && showCursor) showCursorPreview();
}

function showCursorPreview() {
    restoreCanvas();
    ctx.save();
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, currentBrushSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
}

function restoreCanvas() {
    // Composite committed pixels + all active remote layers
    compositeRemoteLayers();
}

function drawReceivedLine(socketId, x, y, color, size, tool, isStart) {
    const layer = getRemoteLayer(socketId);
    const rc    = layer.ctx;

    rc.lineWidth   = size;
    rc.lineCap     = 'round';
    rc.lineJoin    = 'round';
    rc.strokeStyle = tool === 'brush' ? color : '#ffffff';

    if (isStart || !layer.drawing) {
        // Clear this user's offscreen canvas for a new stroke
        rc.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.drawing = true;
        layer.lastX   = x;
        layer.lastY   = y;
        rc.beginPath();
        rc.moveTo(x, y);
        rc.lineTo(x, y); 
    } else {
        rc.beginPath();
        rc.moveTo(layer.lastX, layer.lastY);
        rc.lineTo(x, y);
    }

    rc.stroke();
    layer.lastX = x;
    layer.lastY = y;

    // Composite all layers onto main canvas (does NOT touch ctx path state)
    compositeRemoteLayers();
}
