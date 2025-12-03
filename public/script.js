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

// Track mouse position
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
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
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Restore canvas before starting (removes cursor preview)
    restoreCanvas();
    
    // Begin new path
    ctx.beginPath();
    ctx.moveTo(x, y);
}

// Draw on canvas
function draw(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
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
    ctx.lineTo(x, y);
    ctx.stroke();
}

// Stop drawing
function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        ctx.beginPath();
        // Save canvas state after drawing
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
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