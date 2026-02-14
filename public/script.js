// Initialize Socket.io connection
const socket = io();

// Log when connected
socket.on('connect', () => {
    console.log('✅ Connected to server! Socket ID:', socket.id);
});

// Log when disconnected
socket.on('disconnect', () => {
    console.log('❌ Disconnected from server!');
});

// Receive drawing data from other users
socket.on('draw', (data) => {
    // Check if it's the start of a stroke
    if (data.isStart) {
        // Reset remote drawing and prepare for new stroke
        remoteDrawing = false;
        drawReceivedLine(data.x, data.y, data.color, data.size, data.tool);
    } else {
        // Continue the line
        drawReceivedLine(data.x, data.y, data.color, data.size, data.tool);
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

// Drawing state
let isDrawing = false;
let currentColor = '#000000';
let currentBrushSize = 5;
let currentTool = 'brush'; // 'brush' or 'eraser'

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
    
    // Tell server to clear everyone's canvas
    socket.emit('clear');
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
    isDrawing = true;
    const pos = getMousePos(e);
    
    // Restore canvas before starting (removes cursor preview)
    restoreCanvas();
    
    // Begin new path
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Draw a dot immediately on click
    drawDot(pos.x, pos.y);
    
    // Send start point to server
    socket.emit('draw', {
        x: pos.x,
        y: pos.y,
        color: currentColor,
        size: currentBrushSize,
        tool: currentTool,
        isStart: true  // Mark as start of stroke
    });
}

// Draw a single dot (for single clicks)
function drawDot(x, y) {
    ctx.save();
    ctx.lineWidth = currentBrushSize;
    ctx.lineCap = 'round';
    
    // Set color based on tool
    if (currentTool === 'brush') {
        ctx.fillStyle = currentColor;
    } else if (currentTool === 'eraser') {
        ctx.fillStyle = '#ffffff'; // White (erases)
    }
    
    // Draw a filled circle as a dot
    ctx.beginPath();
    ctx.arc(x, y, currentBrushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Don't send to server here - will be sent by startDrawing
}

// Draw on canvas
function draw(e) {
    if (!isDrawing) return;
    
    const pos = getMousePos(e);
    
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
    
    // Draw line
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    // Send drawing data to server
    socket.emit('draw', {
        x: pos.x,
        y: pos.y,
        color: currentColor,
        size: currentBrushSize,
        tool: currentTool
    });
}

// Stop drawing
function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        ctx.beginPath();
        // Save canvas state after drawing
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Tell server drawing stopped
        socket.emit('mouseup');
        
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
function drawReceivedLine(x, y, color, size, tool) {
    ctx.save();
    
    if (!remoteDrawing) {
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
    
    // Draw line
    ctx.lineTo(x, y);
    ctx.stroke();
    
    remoteLastX = x;
    remoteLastY = y;
    
    ctx.restore();
    
    // Save canvas state
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Draw dot received from other users
function drawReceivedDot(x, y, color, size, tool) {
    ctx.save();
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    
    if (tool === 'brush') {
        ctx.fillStyle = color;
    } else {
        ctx.fillStyle = '#ffffff';
    }
    
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Save canvas state
    canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Reset remote drawing
    remoteDrawing = false;
}