// Initialize Socket.io connection
const socket = io();

// Room state
let currentRoomId = null;

// Get UI elements
const roomInfo = document.getElementById('roomInfo');
const roomIdDisplay = document.getElementById('roomId');
const userCountDisplay = document.getElementById('userCount');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const createRoomBtn = document.getElementById('createRoomBtn');

// Check URL for room parameter
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

// Log when connected
socket.on('connect', () => {
    console.log('✅ Connected to server! Socket ID:', socket.id);
    
    // If room in URL, join it
    if (roomFromUrl) {
        joinRoom(roomFromUrl);
    }
});

// Log when disconnected
socket.on('disconnect', () => {
    console.log('❌ Disconnected from server!');
});

// Handle room created
socket.on('room-created', (data) => {
    currentRoomId = data.roomId;
    showRoomInfo(data.roomId, data.userCount);
    updateUrl(data.roomId);
    console.log('🎉 Room created:', data.roomId);
});

// Handle room joined
socket.on('room-joined', (data) => {
    currentRoomId = data.roomId;
    showRoomInfo(data.roomId, data.userCount);
    console.log('🚪 Joined room:', data.roomId);
});

// Handle user count updates
socket.on('user-count-update', (userCount) => {
    updateUserCount(userCount);
    console.log('👥 User count updated:', userCount);
});

// Create room button
createRoomBtn.addEventListener('click', () => {
    socket.emit('create-room');
});

// Copy link button
copyLinkBtn.addEventListener('click', () => {
    const link = `${window.location.origin}/?room=${currentRoomId}`;
    navigator.clipboard.writeText(link).then(() => {
        // Show "Copied!" feedback
        copyLinkBtn.textContent = 'Copied!';
        copyLinkBtn.classList.add('copied');
        
        setTimeout(() => {
            copyLinkBtn.textContent = 'Copy Invite Link';
            copyLinkBtn.classList.remove('copied');
        }, 2000);
    });
});

// Function to join a room
function joinRoom(roomId) {
    socket.emit('join-room', roomId);
}

// Function to show room info
function showRoomInfo(roomId, userCount) {
    roomIdDisplay.textContent = roomId;
    userCountDisplay.textContent = userCount;
    roomInfo.style.display = 'flex';
    createRoomBtn.style.display = 'none';
}

// Function to update user count
function updateUserCount(count) {
    userCountDisplay.textContent = count;
}

// Function to update URL without reload
function updateUrl(roomId) {
    const newUrl = `${window.location.origin}/?room=${roomId}`;
    window.history.pushState({}, '', newUrl);
}

// Receive drawing data from other users
socket.on('draw', (data) => {
    // Check if it's the start of a stroke
    if (data.isStart) {
        // Reset remote drawing and prepare for new stroke
        remoteDrawing = false;
        drawReceivedLine(data.x, data.y, data.color, data.size, data.tool, true);
    } else {
        // Continue the line
        drawReceivedLine(data.x, data.y, data.color, data.size, data.tool, false);
    }
});

// Receive clear event from other users
socket.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    console.log('Canvas cleared by another user');
});

// Reset remote drawing when mouse up
socket.on('mouseup', () => {
    remoteDrawing = false;
});

// Get canvas element and context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Get toolbar elements
const brushBtn = document.getElementById('brushBtn');
const eraserBtn = document.getElementById('eraserBtn');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

// Drawing state
let isDrawing = false;
let currentColor = '#000000';
let currentBrushSize = 5;
let currentTool = 'brush'; // 'brush' or 'eraser'
let lastX = 0;
let lastY = 0;

// Store canvas image data
let canvasImage = null;

// Cursor preview
let mouseX = 0;
let mouseY = 0;
let showCursor = false;

// Remote drawing state
let remoteDrawing = false;
let remoteLastX = 0;
let remoteLastY = 0;

// Tool selection
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
    canvas.style.cursor = 'none'; // Hide default cursor
});

// Update brush size display when slider changes
brushSize.addEventListener('input', (e) => {
    currentBrushSize = e.target.value;
    brushSizeValue.textContent = `${currentBrushSize}px`;
});

// Update color when color picker changes
colorPicker.addEventListener('change', (e) => {
    currentColor = e.target.value;
});

// Clear canvas when button clicked
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvasImage = null;
    
    // Tell server to clear everyone's canvas in this room
    socket.emit('clear', currentRoomId);
});

// Download canvas as image
downloadBtn.addEventListener('click', () => {
    // Create a temporary link
    const link = document.createElement('a');
    
    // Get current date/time for filename
    const date = new Date();
    const filename = `paint-together-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}-${date.getHours()}${date.getMinutes()}${date.getSeconds()}.png`;
    
    // Set download attributes
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    
    // Trigger download
    link.click();
    
    console.log('Canvas downloaded as:', filename);
});

// Mouse event listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', () => {
    stopDrawing();
    showCursor = false;
    restoreCanvas();
});
canvas.addEventListener('mouseenter', () => {
    showCursor = true;
});

// Get proper mouse coordinates accounting for canvas scaling
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// Track mouse position
function handleMouseMove(e) {
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    
    // Draw if mouse is pressed
    if (isDrawing) {
        draw(e);
    } else if (currentTool === 'eraser' && showCursor) {
        // Only show cursor preview when NOT drawing
        showCursorPreview();
    }
}

// Start drawing
function startDrawing(e) {
    if (!currentRoomId) {
        alert('Please create or join a room first!');
        return;
    }
    
    isDrawing = true;
    const pos = getMousePos(e);
    
    // Store starting position
    lastX = pos.x;
    lastY = pos.y;
    
    // Restore canvas before starting (removes cursor preview)
    restoreCanvas();
    
    // Begin new path for this stroke
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Configure drawing settings
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Set color based on tool
    if (currentTool === 'brush') {
        ctx.strokeStyle = currentColor;
    } else if (currentTool === 'eraser') {
        ctx.strokeStyle = '#ffffff'; // White (erases)
    }
    
    // Send start point to server
    socket.emit('draw', {
        x: pos.x,
        y: pos.y,
        color: currentColor,
        size: currentBrushSize,
        tool: currentTool,
        isStart: true,
        roomId: currentRoomId
    });
}

// Draw on canvas
function draw(e) {
    if (!isDrawing) return;
    
    const pos = getMousePos(e);
    
    // Draw line to current position
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    // Start next segment from current position
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Update last position
    lastX = pos.x;
    lastY = pos.y;
    
    // Send drawing data to server
    socket.emit('draw', {
        x: pos.x,
        y: pos.y,
        color: currentColor,
        size: currentBrushSize,
        tool: currentTool,
        roomId: currentRoomId
    });
}

// Stop drawing
function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        // Save canvas state after drawing
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Tell server drawing stopped
        socket.emit('mouseup', currentRoomId);
        
        // Show cursor preview again if using eraser
        if (currentTool === 'eraser' && showCursor) {
            showCursorPreview();
        }
    }
}

// Show cursor preview (for eraser)
function showCursorPreview() {
    // Restore original canvas first
    restoreCanvas();
    
    // Draw cursor circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, currentBrushSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
    ctx.stroke();
    ctx.restore();
}

// Restore canvas to saved state
function restoreCanvas() {
    if (canvasImage) {
        ctx.putImageData(canvasImage, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Draw line received from other users
function drawReceivedLine(x, y, color, size, tool, isStart) {
    ctx.save();
    
    if (isStart || !remoteDrawing) {
        // Start new path
        remoteDrawing = true;
        remoteLastX = x;
        remoteLastY = y;
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
    
    // Drawing settings
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'brush') {
        ctx.strokeStyle = color;
    } else {
        ctx.strokeStyle = '#ffffff';
    }
    
    // Draw line to new position
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // Start next segment from current position
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    remoteLastX = x;
    remoteLastY = y;
    
    ctx.restore();
    
    // Save canvas state
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
}