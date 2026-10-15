const { test } = require('node:test');
const assert = require('node:assert');
const p = require('./server');

test('parsePassword keeps the exact string, cut to 64 chars', () => {
    assert.strictEqual(p.parsePassword({ password: ' secret ' }), ' secret ');
    assert.strictEqual(p.parsePassword({ password: 'x'.repeat(100) }).length, p.MAX_PASSWORD_LENGTH);
    for (const bad of [null, undefined, 'secret', {}, { password: '' }, { password: 5 }, { password: ['a'] }]) {
        assert.strictEqual(p.parsePassword(bad), null);
    }
});

test('hash and check: right password passes, wrong fails, salt differs per hash', async () => {
    const h1 = await p.hashPassword('hunter2');
    const h2 = await p.hashPassword('hunter2');
    assert.match(h1, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
    assert.notStrictEqual(h1, h2);
    assert.strictEqual(h1.includes('hunter2'), false);
    assert.strictEqual(await p.checkPassword('hunter2', h1), true);
    assert.strictEqual(await p.checkPassword('hunter2', h2), true);
    assert.strictEqual(await p.checkPassword('Hunter2', h1), false);
    assert.strictEqual(await p.checkPassword('hunter2 ', h1), false);
    assert.strictEqual(await p.checkPassword(null, h1), false);
    assert.strictEqual(await p.checkPassword(undefined, h1), false);
});

test('a room without a password lets everyone in', async () => {
    assert.strictEqual(await p.checkPassword(null, null), true);
    assert.strictEqual(await p.checkPassword('anything', undefined), true);
});

test('a corrupt stored hash never matches', async () => {
    for (const stored of ['nonsense', 'aa:bb', ':', 'zz:zz']) {
        assert.strictEqual(await p.checkPassword('x', stored), false, stored);
    }
});

test('clientIp uses the last X-Forwarded-For entry, else the socket address', () => {
    assert.strictEqual(p.clientIp({ handshake: { headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, address: '10.0.0.1' } }), '1.2.3.4');
    assert.strictEqual(p.clientIp({ handshake: { headers: {}, address: '10.0.0.1' } }), '10.0.0.1');
    assert.strictEqual(p.clientIp({}), 'unknown');
});

test('limiter: 5 wrong tries lock an IP for 30 s, other IPs are not affected', () => {
    let t = 0;
    const limiter = p.createLimiter(() => t);
    for (let i = 0; i < p.MAX_FAILED_TRIES - 1; i++) limiter.fail('1.1.1.1');
    assert.strictEqual(limiter.waitFor('1.1.1.1'), 0);
    limiter.fail('1.1.1.1');
    assert.strictEqual(limiter.waitFor('1.1.1.1'), p.LOCKOUT_MS);
    assert.strictEqual(limiter.waitFor('2.2.2.2'), 0);
    t += p.LOCKOUT_MS - 1;
    assert.strictEqual(limiter.waitFor('1.1.1.1'), 1);
    t += 1;
    assert.strictEqual(limiter.waitFor('1.1.1.1'), 0);
    limiter.fail('1.1.1.1');
    assert.strictEqual(limiter.waitFor('1.1.1.1'), 0, 'count restarts after the lockout');
});

test('limiter: a right password resets the count', () => {
    const limiter = p.createLimiter(() => 0);
    for (let i = 0; i < p.MAX_FAILED_TRIES - 1; i++) limiter.fail('1.1.1.1');
    limiter.reset('1.1.1.1');
    limiter.fail('1.1.1.1');
    assert.strictEqual(limiter.waitFor('1.1.1.1'), 0);
});
