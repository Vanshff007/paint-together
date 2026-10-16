// Shortcuts feature: keyboard shortcuts for undo/redo and the drawing tools.
// shortcutFor() also loads in Node for tests (see shortcuts.test.js).

const TOOL_KEYS = { b: 'brushBtn', e: 'eraserBtn', l: 'lineBtn', r: 'rectBtn', o: 'circleBtn', f: 'fillBtn', t: 'textBtn', i: 'imageBtn', s: 'selectBtn', k: 'pickerBtn' };

// KeyboardEvent-like { key, ctrlKey, metaKey, shiftKey, altKey } -> id of the button to click, or null.
// Ctrl on Windows/Linux and Cmd on macOS both work for undo/redo.
function shortcutFor(e) {
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    if (e.altKey) return null;
    if (e.ctrlKey || e.metaKey) {
        if (key === 'z') return e.shiftKey ? 'redoBtn' : 'undoBtn';
        if (key === 'y' && !e.shiftKey) return 'redoBtn';
        return null;
    }
    return TOOL_KEYS[key] || null;
}

if (typeof module !== 'undefined') module.exports = { shortcutFor, TOOL_KEYS };

if (typeof document !== 'undefined') {
    // typing in the chat or name field keeps the browser's own keys (also Ctrl+Z)
    const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

    document.addEventListener('keydown', (e) => {
        if (isTyping(e.target) || !appScreen.classList.contains('visible')) return;
        const id = shortcutFor(e);
        const btn = id && document.getElementById(id);
        if (!btn) return;
        e.preventDefault();
        if (!btn.disabled) btn.click();
    });
}
