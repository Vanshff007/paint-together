// Zoom feature: two-finger pinch to zoom and pan the canvas on touch screens.
// pinchTransform() also loads in Node for tests (see zoom.test.js).

const MAX_ZOOM  = 4;
const SNAP_ZOOM = 1.05; // closer to 1 than this snaps back to no zoom

// New CSS transform for the canvas frame during a pinch.
// start: { scale, x, y } when the pinch began, plus d (finger distance) and mx, my
// (finger midpoint, relative to the frame's untransformed top-left).
// d, mx, my: the same now. w, h: frame size without zoom.
// The canvas point that was under the fingers stays under them, and the zoomed
// canvas always covers the whole frame area (no empty gaps when panning).
function pinchTransform(start, d, mx, my, w, h) {
    let scale = Math.min(MAX_ZOOM, Math.max(1, start.scale * d / start.d));
    if (scale < SNAP_ZOOM) return { scale: 1, x: 0, y: 0 };
    const ux = (start.mx - start.x) / start.scale; // canvas point under the starting midpoint
    const uy = (start.my - start.y) / start.scale;
    const clamp = (v, min) => Math.min(0, Math.max(min, v));
    return {
        scale,
        x: clamp(mx - ux * scale, w - w * scale),
        y: clamp(my - uy * scale, h - h * scale)
    };
}

if (typeof module !== 'undefined') module.exports = { pinchTransform, MAX_ZOOM, SNAP_ZOOM };

if (typeof document !== 'undefined') {
    let zoom  = { scale: 1, x: 0, y: 0 };
    let pinch = null;          // pinch start, while two fingers are down
    let gestureActive = false; // from the second finger until every finger is up

    function applyZoom() {
        canvasFrame.style.transform = zoom.scale === 1 ? '' : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    }

    // the frame's position without zoom (transform-origin is its top-left corner)
    function frameOrigin() {
        const r = canvasFrame.getBoundingClientRect();
        return { left: r.left - zoom.x, top: r.top - zoom.y };
    }

    function fingers(e) {
        const [a, b] = e.touches;
        const o = frameOrigin();
        return {
            d:  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
            mx: (a.clientX + b.clientX) / 2 - o.left,
            my: (a.clientY + b.clientY) / 2 - o.top
        };
    }

    // Capture listeners on document run before the drawing and tools listeners.
    // While a pinch gesture is on, no touch event reaches them.
    document.addEventListener('touchstart', (e) => {
        if (!gestureActive && !(e.touches.length === 2 && canvasFrame.contains(e.target))) return;
        e.preventDefault();
        e.stopPropagation();
        if (!gestureActive) {
            gestureActive = true;
            // the first finger already started a stroke or shape: end it (a tap draws nothing)
            activeTouchId = null;
            stopDrawing();
            cancelToolGesture();
        }
        if (e.touches.length === 2) pinch = { ...zoom, ...fingers(e) };
    }, { capture: true, passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!gestureActive) return;
        e.preventDefault();
        e.stopPropagation();
        if (!pinch || e.touches.length < 2) return;
        const f = fingers(e);
        zoom = pinchTransform(pinch, f.d, f.mx, f.my, canvasFrame.offsetWidth, canvasFrame.offsetHeight);
        applyZoom();
    }, { capture: true, passive: false });

    ['touchend', 'touchcancel'].forEach(type => document.addEventListener(type, (e) => {
        if (!gestureActive) return;
        e.stopPropagation();
        if (e.touches.length < 2) pinch = null;
        if (e.touches.length === 0) gestureActive = false;
    }, { capture: true, passive: false }));

    // every room starts unzoomed
    function resetZoom() {
        zoom = { scale: 1, x: 0, y: 0 };
        applyZoom();
    }
    socket.on('room-created', resetZoom);
    socket.on('room-joined', resetZoom);
}
