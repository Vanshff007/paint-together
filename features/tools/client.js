// Tools feature: line, rectangle and ellipse shapes, and a fill bucket.
// The pure functions at the top also load in Node for tests (see tools.test.js).

const SHAPE_TOOLS    = ['line', 'rect', 'circle'];
const FILL_TOLERANCE = 32; // per RGB channel, so fill also covers anti-aliased edges

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
    const unit = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    if (!d || typeof d.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.color)) return false;
    if (d.shape === 'fill') return unit(d.nx1) && unit(d.ny1);
    return SHAPE_TOOLS.includes(d.shape) && unit(d.nx1) && unit(d.ny1) && unit(d.nx2) && unit(d.ny2) &&
           typeof d.ns === 'number' && d.ns > 0 && d.ns <= 1;
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

if (typeof module !== 'undefined') module.exports = { floodFill, hexToRgba, isValidShape, drawShape, FILL_TOLERANCE };

if (typeof document !== 'undefined') {

    // TOOL BUTTONS

    const toolButtons = {
        line:   document.getElementById('lineBtn'),
        rect:   document.getElementById('rectBtn'),
        circle: document.getElementById('circleBtn'),
        fill:   document.getElementById('fillBtn')
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

    const toolActive = () => currentTool === 'fill' || SHAPE_TOOLS.includes(currentTool);
    const clampPos   = (p) => ({
        x: Math.min(Math.max(p.x, 0), canvas.width),
        y: Math.min(Math.max(p.y, 0), canvas.height)
    });

    // CANVAS CHANGES (undo snapshot, commit, sync)

    // Draw onto the committed image (not onto in-progress remote strokes), then show them again
    function commitToCanvas(drawFn) {
        if (canvasImage) ctx.putImageData(canvasImage, 0, 0);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFn(ctx);
        canvasImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        compositeRemoteLayers();
    }

    function beginChange() {
        restoreCanvas();
        if (currentRoomId) socket.emit('save-undo-snapshot', { roomId: currentRoomId, state: canvas.toDataURL('image/png') });
        else saveToUndoStack();
    }

    function cancelChange() {
        if (currentRoomId) {
            socket.emit('discard-undo-snapshot', currentRoomId);
        } else {
            localUndoStack.pop();
            updateUndoRedoButtons();
        }
    }

    function finishChange(payload) {
        if (!currentRoomId) return;
        socket.emit('draw-shape', { roomId: currentRoomId, ...payload });
        socket.emit('stroke-complete', { roomId: currentRoomId, state: canvas.toDataURL('image/png') });
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

    // REMOTE SHAPES AND FILLS

    socket.on('draw-shape', (data) => {
        if (!isValidShape(data)) return;
        const a = fromNorm(data.nx1, data.ny1);
        if (data.shape === 'fill') {
            commitToCanvas(c => fillAt(c, a.x, a.y, data.color));
        } else {
            const b = fromNorm(data.nx2, data.ny2);
            commitToCanvas(c => drawShape(c, data.shape, a.x, a.y, b.x, b.y, data.color, denormSize(data.ns)));
        }
        if (shapeStart && shapeEnd) pointerMove(shapeEnd); // the commit wiped the local preview
    });
}
