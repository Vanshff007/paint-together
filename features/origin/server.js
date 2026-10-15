// Socket.io allowRequest: accept only browsers on a page served by this host.
// CORS headers alone do not cover WebSocket connections, so the Origin header
// is checked here for every transport. No Origin header (non-browser client) is allowed;
// the check protects other people's browsers, not the server.
function allowRequest(req, callback) {
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch (err) {
        return callback(null, false); // "null" origin from sandboxed frames, or garbage
    }
    callback(null, originHost === req.headers.host);
}

module.exports = { allowRequest };
