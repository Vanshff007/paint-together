// Tools feature: line, rectangle and ellipse shapes, fill bucket, text, and inserted images.
// The pure functions at the top also load in Node for tests (see tools.test.js).

const SHAPE_TOOLS    = ['line', 'rect', 'circle'];
const FILL_TOLERANCE = 32; // per RGB channel, so fill also covers anti-aliased edges
const MAX_TEXT_LENGTH = 100;
const IMAGE_MAX_SHARE = 0.6; // an inserted image fits in 60% of the canvas width and height
// only inline image data: a URL would make every member fetch it and taint the canvas
const IMAGE_DATA_URL  = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// '#rrggbb' -> [r, g, b, 255]
function hexToRgba(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// Scanline flood fill on ImageData-like { data, width, height }. Pixels are compared as
// they look on the white page: transparent (never drawn) counts as white, like the eraser.
// Returns the number of filled pixels (0 when nothing changes).
function floodFill(image, x, y, fill, tolerance = 0) {
    const { data, width, height } = image;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;

    const onWhite = (i, c) => {
        const a = data[i + 3] / 255;
        return data[i + c] * a + 255 * (1 - a);
    };
    const start = (y * width + x) * 4;
    const target = [onWhite(start, 0), onWhite(start, 1), onWhite(start, 2)];
    if (data[start + 3] === 255 && fill.every((v, c) => v === data[start + c])) return 0;
    const matches = (i) => Math.abs(onWhite(i, 0) - target[0]) <= tolerance &&
                           Math.abs(onWhite(i, 1) - target[1]) <= tolerance &&
                           Math.abs(onWhite(i, 2) - target[2]) <= tolerance;

    const seen = new Uint8Array(width * height);
    const stack = [x, y];
    let count = 0;
    while (stack.length) {
        const py = stack.pop();
        let px = stack.pop();
        let p = py * width + px;
        while (px > 0 && !seen[p - 1] && matches((p - 1) * 4)) { px--; p--; }
        let spanUp = false, spanDown = false;
        while (px < width && !seen[p] && matches(p * 4)) {
            seen[p] = 1;
            data.set(fill, p * 4);
            count++;
            if (py > 0) {
                const up = p - width;
                const ok = !seen[up] && matches(up * 4);
                if (ok && !spanUp) stack.push(px, py - 1);
                spanUp = ok;
            }
            if (py < height - 1) {
                const down = p + width;
                const ok = !seen[down] && matches(down * 4);
                if (ok && !spanDown) stack.push(px, py + 1);
                spanDown = ok;
            }
            px++; p++;
        }
    }
    return count;
}

// A received draw-shape payload is drawn only if every field is sane
function isValidShape(d) {
    if (!d) return false;
    const unit  = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    const color = typeof d.color === 'string' && /^#[0-9a-f]{6}$/i.test(d.color);
    const size  = typeof d.ns === 'number' && d.ns > 0 && d.ns <= 1;
    const point = unit(d.nx1) && unit(d.ny1);
    const box   = point && unit(d.nx2) && unit(d.ny2);
    switch (d.shape) {
        case 'fill':  return color && point;
        case 'text':  return color && size && point && typeof d.text === 'string' &&
                             d.text.length > 0 && d.text.length <= MAX_TEXT_LENGTH;
        case 'image': return box && d.nx2 > d.nx1 && d.ny2 > d.ny1 &&
                             typeof d.src === 'string' && IMAGE_DATA_URL.test(d.src);
        default:      return SHAPE_TOOLS.includes(d.shape) && color && size && box;
    }
}

// Text with its top-left corner at (x, y)
function drawText(c, text, x, y, color, fontPx) {
    c.save();
    c.fillStyle    = color;
    c.font         = `bold ${fontPx}px sans-serif`;
    c.textBaseline = 'top';
    c.fillText(text, x, y);
    c.restore();
}

// Size for an inserted image: keeps its shape, only ever shrinks, fits in maxW x maxH
function fitImage(w, h, maxW, maxH) {
    const scale = Math.min(1, maxW / w, maxH / h);
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// Outline from (x1, y1) to (x2, y2); a circle is the ellipse inside that box
function drawShape(c, shape, x1, y1, x2, y2, color, size) {
    c.save();
    c.strokeStyle = color;
    c.lineWidth   = size;
    c.lineCap     = 'round';
    c.lineJoin    = 'round';
    c.beginPath();
    if (shape === 'line') {
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
    } else if (shape === 'rect') {
        c.rect(x1, y1, x2 - x1, y2 - y1);
    } else {
        c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    }
    c.stroke();
    c.restore();
}

// HISTORY CHANGES ("ops")
// Every change in a room is kept as an op, so the canvas can be redrawn without one
// user's undone changes (features/history). Two types:
//   { type: 'stroke', points: [[nx, ny], ...], color, ns, tool }  brush or eraser stroke
//   { type: 'shape', shape, nx1, ny1, ... }                       any draw-shape payload
const MAX_STROKE_POINTS = 2000;
const OP_KEYS = ['type', 'points', 'color', 'ns', 'tool', 'shape', 'nx1', 'ny1', 'nx2', 'ny2', 'text', 'src'];

function isValidOp(op) {
    if (!op || typeof op !== 'object') return false;
    if (op.type === 'shape') return isValidShape(op);
    if (op.type !== 'stroke') return false;
    const unit = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    return Array.isArray(op.points) && op.points.length > 0 && op.points.length <= MAX_STROKE_POINTS &&
           op.points.every(p => Array.isArray(p) && p.length === 2 && unit(p[0]) && unit(p[1])) &&
           typeof op.color === 'string' && /^#[0-9a-f]{6}$/i.test(op.color) &&
           typeof op.ns === 'number' && op.ns > 0 && op.ns <= 1 &&
           (op.tool === 'brush' || op.tool === 'eraser');
}

// only the known fields of a valid op (drops anything else a client added)
function cleanOp(op) {
    const clean = {};
    OP_KEYS.forEach(k => { if (op[k] !== undefined) clean[k] = op[k]; });
    return clean;
}

// Draws one op onto a 2D context of a W x H canvas. image: the decoded picture of an image op.
// Strokes are drawn segment by segment, exactly like live drawing.
function drawOp(c, op, W, H, image) {
    if (op.type === 'stroke') {
        c.save();
        c.lineWidth   = op.ns * W;
        c.lineCap     = 'round';
        c.lineJoin    = 'round';
        c.strokeStyle = op.tool === 'eraser' ? '#ffffff' : op.color;
        c.beginPath();
        c.moveTo(op.points[0][0] * W, op.points[0][1] * H);
        for (let i = 1; i < op.points.length; i++) {
            const x = op.points[i][0] * W, y = op.points[i][1] * H;
            c.lineTo(x, y);
            c.stroke();
            c.beginPath();
            c.moveTo(x, y);
        }
        c.restore();
        return;
    }
    const x1 = op.nx1 * W, y1 = op.ny1 * H, x2 = op.nx2 * W, y2 = op.ny2 * H;
    if (op.shape === 'fill') {
        const img = c.getImageData(0, 0, W, H);
        if (floodFill(img, x1, y1, hexToRgba(op.color), FILL_TOLERANCE)) c.putImageData(img, 0, 0);
    } else if (op.shape === 'text') {
        drawText(c, op.text, x1, y1, op.color, op.ns * W);
    } else if (op.shape === 'image') {
        if (image) c.drawImage(image, x1, y1, x2 - x1, y2 - y1);
    } else {
        drawShape(c, op.shape, x1, y1, x2, y2, op.color, op.ns * W);
    }
}

if (typeof module !== 'undefined') module.exports = {
    floodFill, hexToRgba, isValidShape, drawShape, drawText, fitImage, isValidOp, cleanOp, drawOp,
    FILL_TOLERANCE, MAX_TEXT_LENGTH, MAX_STROKE_POINTS
};

if (typeof document !== 'undefined') {

    // TOOL BUTTONS

    const toolButtons = {
        line:   document.getElementById('lineBtn'),
        rect:   document.getElementById('rectBtn'),
        circle: document.getElementById('circleBtn'),
        fill:   document.getElementById('fillBtn'),
        text:   document.getElementById('textBtn')
    };

    Object.entries(toolButtons).forEach(([tool, btn]) => {
        btn.addEventListener('click', () => {
            currentTool = tool;
            document.querySelectorAll('.toolbar .tool-btn').forEach(b => b.classList.toggle('active', b === btn));
            canvas.style.cursor = 'crosshair';
            restoreCanvas();
        });
    });

    // brush and eraser buttons only deactivate each other
    [brushBtn, eraserBtn].forEach(btn => btn.addEventListener('click', () => {
        Object.values(toolButtons).forEach(b => b.classList.remove('active'));
    }));

    const toolActive = () => currentTool === 'fill' || currentTool === 'text' || SHAPE_TOOLS.includes(currentTool);
    const clampPos   = (p) => ({
        x: Math.min(Math.max(p.x, 0), canvas.width),
        y: Math.min(Math.max(p.y, 0), canvas.height)
    });

    // CANVAS CHANGES (undo, commit, sync)

    const commitToCanvas = drawOnCommitted; // history feature: draws below in-progress remote strokes

    // offline: a local undo step; in a room the server keeps the history (one op per change)
    function beginChange() {
        restoreCanvas();
        if (!currentRoomId) saveToUndoStack();
    }

    function cancelChange() {
        if (currentRoomId) return;
        localUndoStack.pop();
        updateUndoRedoButtons();
    }

    function finishChange(payload) {
        if (!currentRoomId) return;
        socket.emit('op', { roomId: currentRoomId, op: { type: 'shape', ...payload }, state: canvasState() });
    }

    function fillAt(c, x, y, color) {
        const image = c.getImageData(0, 0, canvas.width, canvas.height);
        const filled = floodFill(image, x, y, hexToRgba(color), FILL_TOLERANCE);
        if (filled) c.putImageData(image, 0, 0);
        return filled;
    }

    // POINTER HANDLING
    // Listeners sit on the canvas container in the capture phase: when a tool from this
    // feature is active they stop the event, so the brush handlers on the canvas never see it.

    let shapeStart = null; // canvas position where the current shape drag began
    let shapeEnd   = null; // latest drag position, to redraw the preview

    function pointerDown(pos) {
        if (currentTool === 'text') return openTextInput(pos);
        if (currentTool !== 'fill') {
            shapeStart = pos;
            return;
        }
        beginChange();
        let filled = 0;
        commitToCanvas(c => { filled = fillAt(c, pos.x, pos.y, currentColor); });
        if (!filled) return cancelChange();
        const n = toNorm(Math.min(pos.x, canvas.width - 1), Math.min(pos.y, canvas.height - 1));
        finishChange({ shape: 'fill', nx1: n.nx, ny1: n.ny, color: currentColor });
    }

    function pointerMove(pos) {
        if (!shapeStart) return;
        shapeEnd = pos;
        restoreCanvas();
        drawShape(ctx, currentTool, shapeStart.x, shapeStart.y, pos.x, pos.y, currentColor, currentBrushSize);
    }

    function pointerUp(pos) {
        if (!shapeStart) return;
        const start = shapeStart;
        shapeStart = shapeEnd = null;
        if (Math.hypot(pos.x - start.x, pos.y - start.y) < 2) return restoreCanvas(); // a tap draws nothing
        beginChange();
        commitToCanvas(c => drawShape(c, currentTool, start.x, start.y, pos.x, pos.y, currentColor, currentBrushSize));
        const a = toNorm(start.x, start.y);
        const b = toNorm(pos.x, pos.y);
        finishChange({ shape: currentTool, nx1: a.nx, ny1: a.ny, nx2: b.nx, ny2: b.ny, color: currentColor, ns: normSize(currentBrushSize) });
    }

    const container = canvas.parentElement;

    container.addEventListener('mousedown', (e) => {
        if (e.target !== canvas || !toolActive()) return;
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
        e.stopPropagation();
        pointerDown(clampPos(getMousePos(e)));
    }, true);
    // on window, so a drag that leaves the canvas still previews and finishes
    window.addEventListener('mousemove', (e) => { if (shapeStart) pointerMove(clampPos(getMousePos(e))); });
    window.addEventListener('mouseup',   (e) => { if (shapeStart) pointerUp(clampPos(getMousePos(e))); });

    let toolTouchId = null;
    const ownTouch = (e) => Array.from(e.changedTouches).find(t => t.identifier === toolTouchId);

    // a second finger turned this touch into a pinch (features/zoom): drop the shape in progress
    window.cancelToolGesture = () => {
        toolTouchId = null;
        if (shapeStart) {
            shapeStart = shapeEnd = null;
            restoreCanvas();
        }
    };

    container.addEventListener('touchstart', (e) => {
        if (e.target !== canvas || !toolActive() || toolTouchId !== null) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (currentTool !== 'fill') toolTouchId = t.identifier;
        pointerDown(clampPos(getTouchPos(t)));
    }, { capture: true, passive: false });

    container.addEventListener('touchmove', (e) => {
        const t = toolTouchId !== null && ownTouch(e);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        pointerMove(clampPos(getTouchPos(t)));
    }, { capture: true, passive: false });

    ['touchend', 'touchcancel'].forEach(type => container.addEventListener(type, (e) => {
        const t = toolTouchId !== null && ownTouch(e);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        toolTouchId = null;
        if (type === 'touchend') pointerUp(clampPos(getTouchPos(t)));
        else { shapeStart = shapeEnd = null; restoreCanvas(); }
    }, { capture: true, passive: false }));

    // TEXT
    // A click opens a text box at that point; Enter or clicking elsewhere draws the text,
    // Escape cancels. Font size follows the Size slider.

    let textBox = null; // { input, pos, fontPx, color } while typing

    const textFontPx = () => 12 + currentBrushSize * 2;

    function openTextInput(pos) {
        closeTextInput(true);
        const input   = document.createElement('input');
        input.type      = 'text';
        input.className = 'canvas-text-input';
        input.maxLength = MAX_TEXT_LENGTH;
        const fontPx  = textFontPx();
        const k       = canvas.clientWidth / canvas.width; // CSS px per canvas px
        input.style.left     = `${canvas.clientLeft + pos.x * k}px`;
        input.style.top      = `${canvas.clientTop + pos.y * k}px`;
        // at least 16px on screen: readable on phones, and iOS does not zoom the page on focus
        input.style.fontSize = `${Math.max(16, fontPx * k)}px`;
        input.style.color    = currentColor;
        canvasFrame.appendChild(input);
        textBox = { input, pos, fontPx, color: currentColor };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  closeTextInput(true);
            if (e.key === 'Escape') closeTextInput(false);
        });
        input.addEventListener('blur', () => closeTextInput(true));
        setTimeout(() => input.focus()); // after the click has finished moving focus
    }

    function closeTextInput(draw) {
        if (!textBox) return;
        const box = textBox;
        textBox = null; // first, so the blur from remove() does nothing
        box.input.remove();
        const text = box.input.value.trim();
        if (!draw || !text) return;
        beginChange();
        commitToCanvas(c => drawText(c, text, box.pos.x, box.pos.y, box.color, box.fontPx));
        const n = toNorm(box.pos.x, box.pos.y);
        finishChange({ shape: 'text', nx1: n.nx, ny1: n.ny, text, color: box.color, ns: box.fontPx / canvas.width });
    }

    // INSERT IMAGE
    // The picture is read locally (never uploaded anywhere else), shrunk to fit 60% of the
    // canvas, centered, and sent to the room as a JPEG data URL inside draw-shape.

    const imageBtn   = document.getElementById('imageBtn');
    const imageInput = document.getElementById('imageInput');

    imageBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        imageInput.value = ''; // the same file can be picked again
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('⚠️ That file is not an image');
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const { w, h } = fitImage(img.naturalWidth, img.naturalHeight,
                canvas.width * IMAGE_MAX_SHARE, canvas.height * IMAGE_MAX_SHARE);
            // re-encode at the placed size: small enough for one Socket.io message
            const tmp = document.createElement('canvas');
            tmp.width = w;
            tmp.height = h;
            const tctx = tmp.getContext('2d');
            tctx.fillStyle = '#ffffff'; // JPEG has no transparency: transparent parts become paper white
            tctx.fillRect(0, 0, w, h);
            tctx.drawImage(img, 0, 0, w, h);
            const x = Math.round((canvas.width - w) / 2);
            const y = Math.round((canvas.height - h) / 2);
            beginChange();
            commitToCanvas(c => c.drawImage(tmp, x, y));
            const a = toNorm(x, y);
            const b = toNorm(x + w, y + h);
            finishChange({ shape: 'image', nx1: a.nx, ny1: a.ny, nx2: b.nx, ny2: b.ny, src: tmp.toDataURL('image/jpeg', 0.85) });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            showToast('⚠️ Could not read that image');
        };
        img.src = url;
    });

    // a remote change was drawn (features/history), which wiped the local shape preview
    socket.on('op', () => {
        if (shapeStart && shapeEnd) pointerMove(shapeEnd);
    });
}
