// =============================================
// DARK MODE
// =============================================
const html = document.documentElement;
let isDark = localStorage.getItem('theme') === 'dark';

function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelectorAll('.dark-toggle, .dark-toggle-app').forEach(btn => {
        btn.textContent = dark ? '☀️' : '🌙';
    });
    localStorage.setItem('theme', dark ? 'dark' : 'light');
}

applyTheme(isDark);

document.getElementById('darkToggleBtn').addEventListener('click', () => {
    isDark = !isDark;
    applyTheme(isDark);
});

document.getElementById('darkToggleBtnApp').addEventListener('click', () => {
    isDark = !isDark;
    applyTheme(isDark);
});

// =============================================
// SPLASH CANVAS ANIMATION
// =============================================
const splashCanvas = document.getElementById('splashCanvas');
const splashCtx = splashCanvas.getContext('2d');
let splashBubbles = [];

function resizeSplash() {
    splashCanvas.width  = window.innerWidth;
    splashCanvas.height = window.innerHeight;
}

resizeSplash();
window.addEventListener('resize', resizeSplash);

// Paint blob object
function createBubble() {
    const colors = [
        'rgba(6,182,212,0.18)',
        'rgba(14,116,144,0.15)',
        'rgba(56,239,125,0.12)',
        'rgba(236,72,153,0.12)',
        'rgba(167,139,250,0.13)',
        'rgba(245,87,108,0.11)',
        'rgba(247,151,30,0.12)',
    ];
    return {
        x: Math.random() * splashCanvas.width,
        y: Math.random() * splashCanvas.height,
        r: 60 + Math.random() * 120,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.005 + Math.random() * 0.01,
    };
}

for (let i = 0; i < 14; i++) splashBubbles.push(createBubble());

function animateSplash() {
    splashCtx.clearRect(0, 0, splashCanvas.width, splashCanvas.height);

    splashBubbles.forEach(b => {
        b.phase += b.speed;
        b.x += b.vx + Math.sin(b.phase) * 0.3;
        b.y += b.vy + Math.cos(b.phase * 0.7) * 0.3;

        // Wrap around edges
        if (b.x < -b.r) b.x = splashCanvas.width + b.r;
        if (b.x > splashCanvas.width + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = splashCanvas.height + b.r;
        if (b.y > splashCanvas.height + b.r) b.y = -b.r;

        // Draw soft blob
        const grad = splashCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, b.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        splashCtx.beginPath();
        splashCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        splashCtx.fillStyle = grad;
        splashCtx.fill();
    });

    if (document.getElementById('landingScreen').style.display !== 'none') {
        requestAnimationFrame(animateSplash);
    }
}

animateSplash();

// =============================================
// SOCKET.IO
// =============================================
const socket = io();

// =============================================
// STATE
// =============================================
let currentRoomId = null;
let myColor       = '#06b6d4';
let myName        = 'Guest';

// =============================================
// LANDING SCREEN ELEMENTS
// =============================================
const landingScreen    = document.getElementById('landingScreen');
const appScreen        = document.getElementById('appScreen');
const usernameInput    = document.getElementById('usernameInput');
const roomCodeInput    = document.getElementById('roomCodeInput');
const landingCreateBtn = document.getElementById('landingCreateBtn');
const landingJoinBtn   = document.getElementById('landingJoinBtn');
const landingError     = document.getElementById('landingError');

// =============================================
// APP UI ELEMENTS
// =============================================
const roomInfo         = document.getElementById('roomInfo');
const roomIdDisplay    = document.getElementById('roomId');
const userCountDisplay = document.getElementById('userCount');
const copyLinkBtn      = document.getElementById('copyLinkBtn');
const exitRoomBtn      = document.getElementById('exitRoomBtn');
const myNameBadge      = document.getElementById('myNameBadge');
const toast            = document.getElementById('toast');

// =============================================
// CANVAS ELEMENTS
// =============================================
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const cursorOverlay = document.getElementById('cursorOverlay');

// =============================================
// TOOLBAR ELEMENTS
// =============================================
const brushBtn         = document.getElementById('brushBtn');
const eraserBtn        = document.getElementById('eraserBtn');
const colorPalette     = document.getElementById('colorPalette');
const customColorBtn   = document.getElementById('customColorBtn');
const colorPickerModal = document.getElementById('colorPickerModal');
const colorPicker      = document.getElementById('colorPicker');
const colorPickerOk    = document.getElementById('colorPickerOk');
const colorPickerCancel = document.getElementById('colorPickerCancel');
const brushSize        = document.getElementById('brushSize');
const brushSizeValue   = document.getElementById('brushSizeValue');
const clearBtn         = document.getElementById('clearBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const undoBtn          = document.getElementById('undoBtn');
const redoBtn          = document.getElementById('redoBtn');

// =============================================
// MS PAINT COLOR PALETTE
// =============================================
const defaultColors = [
    // Row 1 - Primary bright colors
    '#FFFFFF', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF',
    // Row 2 - Secondary/pastel colors
    '#C0C0C0', '#FFFF80', '#00FF80', '#80FFFF', '#8080FF', '#FF0080', '#FF8040'
];

let selectedColorElement = null;
let paletteInitialized = false;
let currentColor = '#000000'; // Default black (not in palette but available)

// Initialize palette (called when app screen is shown)
function initColorPalette() {
    if (paletteInitialized) return;
    paletteInitialized = true;

    // Generate palette swatches
    defaultColors.forEach((color, index) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.background = color;
        swatch.dataset.color = color;
        
        swatch.addEventListener('click', () => {
            selectColor(color, swatch);
        });
        
        colorPalette.appendChild(swatch);
    });

    // Custom color button — show modal
    customColorBtn.addEventListener('click', () => {
        colorPicker.value = currentColor; // Set to current color
        colorPickerModal.classList.add('show');
    });

    // Modal OK button
    colorPickerOk.addEventListener('click', () => {
        selectColor(colorPicker.value, null);
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        colorPickerModal.classList.remove('show');
    });

    // Modal Cancel button
    colorPickerCancel.addEventListener('click', () => {
        colorPickerModal.classList.remove('show');
    });

    // Close modal on backdrop click
    colorPickerModal.addEventListener('click', (e) => {
        if (e.target === colorPickerModal) {
            colorPickerModal.classList.remove('show');
        }
    });
}

// Select color function
function selectColor(color, element) {
    currentColor = color;
    
    // Update active state
    if (selectedColorElement) {
        selectedColorElement.classList.remove('active');
    }
    if (element) {
        element.classList.add('active');
        selectedColorElement = element;
    }
}

// =============================================
// DRAWING STATE
// =============================================
let isDrawing        = false;
let hasDrawnInStroke = false;
// currentColor already declared in palette section
let currentBrushSize = 5;
let currentTool      = 'brush';
let lastX            = 0;
let lastY            = 0;
let canvasImage      = null;

let mouseX     = 0;
let mouseY     = 0;
let showCursor = false;

let remoteDrawing = false;
let remoteLastX   = 0;
let remoteLastY   = 0;

// =============================================
// UNDO/REDO STATE
// =============================================
let localUndoStack  = [];
let localRedoStack  = [];
const MAX_LOCAL_HISTORY = 30;
let serverHasUndo   = false;
let serverHasRedo   = false;

// =============================================
// REMOTE CURSORS
// =============================================
const remoteCursors = {};

// =============================================
// TOAST
// =============================================
let toastTimer = null;

function showToast(message, duration = 2500) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// =============================================
// TRANSITION: LANDING → APP
// =============================================
function showApp() {
    // Initialize color palette on first show
    initColorPalette();

    // Fade out landing
    landingScreen.classList.add('fade-out');

    setTimeout(() => {
        landingScreen.style.display = 'none';
        appScreen.style.display     = 'flex';
        appScreen.style.flexDirection = 'column';

        // Trigger fade in
        requestAnimationFrame(() => {
            appScreen.classList.add('visible');
        });
    }, 600);
}

// =============================================
// LANDING SCREEN LOGIC
// =============================================
function getLandingName() {
    const name = usernameInput.value.trim();
    if (!name) {
        showLandingError('Please enter your name first!');
        usernameInput.focus();
        return null;
    }
    return name;
}

function showLandingError(msg) {
    landingError.textContent = msg;
    setTimeout(() => { landingError.textContent = ''; }, 3000);
}

// Create Room
landingCreateBtn.addEventListener('click', () => {
    const name = getLandingName();
    if (!name) return;
    myName = name;
    socket.emit('create-room', { userName: name });
});

// Join Room
landingJoinBtn.addEventListener('click', () => {
    const name = getLandingName();
    if (!name) return;

    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
        showLandingError('Please enter a room code!');
        roomCodeInput.focus();
        return;
    }

    myName = name;
    socket.emit('join-room', { roomId: code, userName: name });
});

// Allow Enter key in room code input
roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') landingJoinBtn.click();
});

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const code = roomCodeInput.value.trim();
        if (code) landingJoinBtn.click();
        else landingCreateBtn.click();
    }
});

// Also check URL for room param — auto-fill room code
const urlParams   = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
    roomCodeInput.value = roomFromUrl.toUpperCase();
}

// =============================================
// COPY LINK BUTTON
// =============================================
copyLinkBtn.addEventListener('click', () => {
    const link = `${window.location.origin}/?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => {
        copyLinkBtn.textContent = '✅ Copied!';
        copyLinkBtn.classList.add('copied');
        setTimeout(() => {
            copyLinkBtn.textContent = 'Copy Link';
            copyLinkBtn.classList.remove('copied');
        }, 2000);
    });
});

// =============================================
// EXIT ROOM BUTTON
// =============================================
exitRoomBtn.addEventListener('click', () => {
    if (!currentRoomId) return;

    // Disconnect from socket to leave room cleanly
    socket.disconnect();
    
    // Reset state
    currentRoomId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    localUndoStack = [];
    localRedoStack = [];
    updateUndoRedoButtons();
    
    // Clear URL
    window.history.pushState({}, '', '/');
    
    // Hide app, show landing
    appScreen.classList.remove('visible');
    setTimeout(() => {
        appScreen.style.display = 'none';
        landingScreen.style.display = 'flex';
        landingScreen.classList.remove('fade-out');
        
        // Reconnect socket
        socket.connect();
        
        // Restart splash animation
        animateSplash();
    }, 300);
    
    showToast('👋 Left the room');
});

// =============================================
// SOCKET EVENTS
// =============================================
socket.on('connect', () => {
    console.log('✅ Connected:', socket.id);
});

socket.on('disconnect', () => {
    showToast('⚠️ Disconnected. Reconnecting...');
});

// Room created
socket.on('room-created', (data) => {
    currentRoomId = data.roomId;
    myColor       = data.userColor;
    updateRoomUI(data.roomId, data.userCount);
    updateUrl(data.roomId);
    showApp();
    setTimeout(() => showToast('🎉 Room created! Share the link.'), 700);
});

// Room joined
socket.on('room-joined', (data) => {
    currentRoomId = data.roomId;
    myColor       = data.userColor;
    serverHasUndo = data.hasUndo || false;
    serverHasRedo = data.hasRedo || false;
    updateRoomUI(data.roomId, data.userCount);
    updateUndoRedoButtons();
    showApp();
    setTimeout(() => {
        showToast(`🚪 Joined room ${data.roomId}`);
        if (data.canvasState) loadCanvasState(data.canvasState);
    }, 700);
});

// Room not found
socket.on('room-not-found', (roomId) => {
    showLandingError(`Room "${roomId}" not found. Check the code!`);
    window.history.pushState({}, '', '/');
});

// User count
socket.on('user-count-update', (count) => {
    userCountDisplay.textContent = count;
});

// Another user joined
socket.on('user-joined', (data) => {
    showToast(`👋 ${data.name} joined`);
});

// Another user left
socket.on('user-left', (socketId) => {
    removeCursor(socketId);
    showToast('👋 A user left');
});

// Receive drawing
socket.on('draw', (data) => {
    if (data.isStart) remoteDrawing = false;
    drawReceivedLine(data.x, data.y, data.color, data.size, data.tool, data.isStart);
});

// Clear canvas from server
socket.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    showToast('🗑️ Canvas cleared');
});

socket.on('mouseup', () => { remoteDrawing = false; });

// Server restored canvas after undo/redo
socket.on('canvas-restore', (data) => {
    loadCanvasState(data.state);
    serverHasUndo = data.hasUndo;
    serverHasRedo = data.hasRedo;
    updateUndoRedoButtons();
});

// Server updates undo/redo availability
socket.on('history-update', (data) => {
    serverHasUndo = data.hasUndo;
    serverHasRedo = data.hasRedo;
    updateUndoRedoButtons();
});

// Live cursors
socket.on('cursor-move', (data) => {
    updateRemoteCursor(data.socketId, data.x, data.y, data.color, data.name);
});

socket.on('cursor-hide', (socketId) => {
    removeCursor(socketId);
});

socket.on('existing-users', (users) => {
    Object.entries(users).forEach(([socketId, info]) => {
        if (socketId !== socket.id) ensureCursorExists(socketId, info.color, info.name);
    });
});

// =============================================
// ROOM UI HELPERS
// =============================================
function updateRoomUI(roomId, userCount) {
    roomIdDisplay.textContent    = roomId;
    userCountDisplay.textContent = userCount;
    roomInfo.style.visibility    = 'visible';
    myNameBadge.textContent      = `👤 ${myName}`;
}

function updateUrl(roomId) {
    window.history.pushState({}, '', `${window.location.origin}/?room=${roomId}`);
}

// =============================================
// CURSOR FUNCTIONS
// =============================================
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
    remoteCursors[socketId] = { element: wrapper };
}

function updateRemoteCursor(socketId, x, y, color, name) {
    ensureCursorExists(socketId, color, name);
    const cursor      = remoteCursors[socketId];
    const overlayRect = cursorOverlay.getBoundingClientRect();
    const scaleX      = overlayRect.width  / canvas.width;
    const scaleY      = overlayRect.height / canvas.height;
    cursor.element.style.left    = `${x * scaleX}px`;
    cursor.element.style.top     = `${y * scaleY}px`;
    cursor.element.style.display = 'block';
}

function removeCursor(socketId) {
    if (remoteCursors[socketId]) {
        remoteCursors[socketId].element.remove();
        delete remoteCursors[socketId];
    }
}

// =============================================
// TOOLBAR LISTENERS
// =============================================
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
    link.href     = canvas.toDataURL('image/png');
    link.click();
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z')  { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault(); redo();
    }
});

// =============================================
// UNDO / REDO
// =============================================
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

// =============================================
// CANVAS STATE
// =============================================
function loadCanvasState(base64) {
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    img.src = base64;
}

// =============================================
// COORDINATE HELPERS
// =============================================
function getMousePos(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top)  * scaleY
    };
}

// =============================================
// MOUSE EVENTS
// =============================================
canvas.addEventListener('mousedown',  startDrawing);
canvas.addEventListener('mousemove',  handleMouseMove);
canvas.addEventListener('mouseup',    stopDrawing);
canvas.addEventListener('mouseout', () => {
    stopDrawing();
    showCursor = false;
    restoreCanvas();
    if (currentRoomId) socket.emit('cursor-leave', currentRoomId);
});
canvas.addEventListener('mouseenter', () => { showCursor = true; });

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
        socket.emit('cursor-move', { roomId: currentRoomId, x: pos.x, y: pos.y });
    }
}

// =============================================
// TOUCH EVENTS
// =============================================
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    canvas.dispatchEvent(new MouseEvent('mouseup'));
}, { passive: false });

// =============================================
// DRAWING FUNCTIONS
// =============================================
function startDrawing(e) {
    hasDrawnInStroke = false;
    isDrawing        = true;

    const pos = getMousePos(e);
    lastX = pos.x;
    lastY = pos.y;

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
        // Tell server to save current canvas as undo snapshot before this stroke
        socket.emit('save-undo-snapshot', {
            roomId: currentRoomId,
            state:  canvas.toDataURL('image/png')
        });
        socket.emit('draw', {
            x: pos.x, y: pos.y,
            color: currentColor, size: currentBrushSize,
            tool: currentTool, isStart: true, roomId: currentRoomId
        });
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
    lastX = pos.x;
    lastY = pos.y;

    if (currentRoomId) {
        socket.emit('draw', {
            x: pos.x, y: pos.y,
            color: currentColor, size: currentBrushSize,
            tool: currentTool, roomId: currentRoomId
        });
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
        socket.emit('stroke-complete', {
            roomId: currentRoomId,
            state:  canvas.toDataURL('image/png')
        });
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
    if (canvasImage) {
        ctx.putImageData(canvasImage, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// =============================================
// RECEIVE REMOTE DRAWING
// =============================================
function drawReceivedLine(x, y, color, size, tool, isStart) {
    ctx.save();

    if (isStart || !remoteDrawing) {
        remoteDrawing = true;
        remoteLastX   = x;
        remoteLastY   = y;
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = tool === 'brush' ? color : '#ffffff';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    remoteLastX = x;
    remoteLastY = y;

    ctx.restore();
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
}