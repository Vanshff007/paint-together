const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt); // async: hashing runs off the event loop
const MAX_PASSWORD_LENGTH = 64;
const MAX_FAILED_TRIES = 5;
const LOCKOUT_MS = 30 * 1000;
const KEY_LENGTH = 32;

// password from a create/join payload: a non-empty string, cut to 64 chars; else null.
// Not trimmed: spaces are part of a password.
function parsePassword(data) {
    const p = data && data.password;
    return (typeof p === 'string' && p.length > 0) ? p.substring(0, MAX_PASSWORD_LENGTH) : null;
}

// "salt:hash" in hex, salted scrypt
async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// true when the room has no password, or the password matches
async function checkPassword(password, stored) {
    if (!stored) return true;
    if (typeof password !== 'string') return false;
    const [saltHex, hashHex] = stored.split(':');
    const expected = Buffer.from(hashHex || '', 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
    return crypto.timingSafeEqual(hash, expected);
}

// Client IP for the guess limit. Behind Render's proxy the real client is the last
// X-Forwarded-For entry (the one the proxy appended); earlier entries can be faked.
function clientIp(socket) {
    const handshake = socket.handshake || {};
    const forwarded = handshake.headers && handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',').pop().trim();
    return handshake.address || 'unknown';
}

// Wrong-password limit per IP: after MAX_FAILED_TRIES, wait LOCKOUT_MS.
// ponytail: in-memory map, one entry per IP that guessed wrong; fine for one instance.
function createLimiter(now = Date.now) {
    const fails = new Map(); // ip -> { count, until }
    return {
        // ms until this ip may try again, 0 if allowed
        waitFor(ip) {
            const f = fails.get(ip);
            if (!f || !f.until) return 0;
            const left = f.until - now();
            if (left > 0) return left;
            fails.delete(ip);
            return 0;
        },
        fail(ip) {
            const f = fails.get(ip) || { count: 0, until: 0 };
            f.count++;
            if (f.count >= MAX_FAILED_TRIES) f.until = now() + LOCKOUT_MS;
            fails.set(ip, f);
        },
        reset(ip) { fails.delete(ip); }
    };
}

module.exports = {
    parsePassword, hashPassword, checkPassword, clientIp, createLimiter,
    MAX_PASSWORD_LENGTH, MAX_FAILED_TRIES, LOCKOUT_MS
};
