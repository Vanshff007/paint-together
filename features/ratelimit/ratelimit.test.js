const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeIo, createFakeSocket } = require('../fake-socket');
const ratelimit = require('./server');

test('bucket allows a burst, then refills at perSecond', () => {
    let t = 0;
    const take = ratelimit.createBucket({ burst: 3, perSecond: 2 }, () => t);
    assert.deepStrictEqual([take(), take(), take(), take()], [true, true, true, false]);
    t += 500; // one token back
    assert.deepStrictEqual([take(), take()], [true, false]);
    t += 10000; // never more than burst
    assert.deepStrictEqual([take(), take(), take(), take()], [true, true, true, false]);
});

// fake socket with Socket.io's socket.use(): returns a function that sends an event
// through the middleware and reports whether the handler would run
function limitedSocket(io, ctx, id, ip = '1.2.3.4') {
    const socket = createFakeSocket(io, id);
    socket.handshake = { headers: {}, address: ip };
    const middleware = [];
    socket.use = (fn) => middleware.push(fn);
    ratelimit.register(socket, ctx);
    return (event) => {
        let passed = false;
        middleware[0]([event], () => { passed = true; });
        return passed;
    };
}

test('normal brush use (120 draw events per second for 5 s) is never limited', (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    const send = limitedSocket(createFakeIo(), {}, 's1');
    let dropped = 0;
    for (let ms = 0; ms < 5000; ms += 1000 / 120) {
        t.mock.timers.tick(1000 / 120);
        if (!send('draw')) dropped++;
    }
    assert.strictEqual(dropped, 0);
});

test('a chat flood is cut to the burst', (t) => {
    t.mock.method(console, 'warn', () => {});
    t.mock.timers.enable({ apis: ['Date'] });
    const send = limitedSocket(createFakeIo(), {}, 's1');
    const passed = Array.from({ length: 100 }, () => send('chat-message')).filter(Boolean).length;
    assert.strictEqual(passed, ratelimit.LIMITS['chat-message'].burst);
});

test('create-room is limited per IP, across reconnects, not per socket', (t) => {
    t.mock.method(console, 'warn', () => {});
    t.mock.timers.enable({ apis: ['Date'] });
    const io = createFakeIo();
    const ctx = {};
    let passed = 0;
    for (let i = 0; i < 50; i++) {
        if (limitedSocket(io, ctx, `s${i}`, '6.6.6.6')('create-room')) passed++; // a new socket each time
    }
    assert.strictEqual(passed, ratelimit.LIMITS['create-room'].burst);
    assert.strictEqual(limitedSocket(io, ctx, 'other', '7.7.7.7')('create-room'), true, 'other IPs are not affected');
});

test('the limit is logged once per socket', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    t.mock.timers.enable({ apis: ['Date'] });
    const send = limitedSocket(createFakeIo(), {}, 's1');
    for (let i = 0; i < 50; i++) send('chat-message');
    assert.strictEqual(warn.mock.callCount(), 1);
});
