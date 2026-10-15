const { clientIp } = require('../passwords/server');

// Token bucket: `burst` events at once, then `perSecond` more each second.
function createBucket({ burst, perSecond }, now = Date.now) {
    let tokens = burst;
    let last = now();
    return function take() {
        const t = now();
        tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSecond);
        last = t;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    };
}

// Limits per event. `perIp` events share one bucket across all sockets from one IP,
// so reconnecting does not reset them. Normal use stays far below every limit:
// the brush sends about one `draw` per mouse move (60-120 per second).
const LIMITS = {
    'create-room':        { burst: 10,  perSecond: 1 / 30, perIp: true }, // each room is a MongoDB document
    'join-room':          { burst: 20,  perSecond: 1,      perIp: true },
    'draw':               { burst: 400, perSecond: 250 },
    'cursor-move':        { burst: 100, perSecond: 60 },
    'chat-message':       { burst: 8,   perSecond: 1 },
    'save-undo-snapshot': { burst: 10,  perSecond: 4 },   // full-canvas payloads
    'stroke-complete':    { burst: 10,  perSecond: 4 },
    'draw-shape':         { burst: 20,  perSecond: 10 }
};
const DEFAULT_LIMIT = { burst: 60, perSecond: 30 };

// ctx.rateLimitIps holds the per-IP buckets for the whole server.
// ponytail: one bucket per IP and event, never pruned; fine for one small instance.
function register(socket, ctx) {
    const ipBuckets = (ctx.rateLimitIps ||= new Map());
    const socketBuckets = new Map();
    const ip = clientIp(socket);

    function bucketFor(event) {
        const limit = LIMITS[event] || DEFAULT_LIMIT;
        const store = limit.perIp ? ipBuckets : socketBuckets;
        const key = limit.perIp ? `${ip} ${event}` : event;
        if (!store.has(key)) store.set(key, createBucket(limit));
        return store.get(key);
    }

    // Socket.io middleware: an event over its limit is dropped (handler never runs)
    socket.use(([event], next) => {
        if (bucketFor(event)()) return next();
        if (!socket.data.rateLimited) {
            socket.data.rateLimited = true; // log once per socket
            console.warn(`⚠️ Rate limit: dropping '${event}' from ${socket.id} (${ip})`);
        }
    });
}

module.exports = { register, createBucket, LIMITS, DEFAULT_LIMIT };
