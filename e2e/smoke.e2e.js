// Browser smoke tests: two real Chrome windows against the real server code,
// with an in-memory Room model instead of MongoDB. Run with `npm run test:e2e`.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium, firefox, webkit } = require('playwright-core');
const { createServer } = require('../server');

// in-memory stand-in for the Mongoose Room model
function memoryModel() {
    const docs = {};
    return {
        docs,
        async findOne({ roomId }) { return docs[roomId] || null; },
        async create(doc) { docs[doc.roomId] = { ...doc }; },
        async findOneAndUpdate({ roomId }, update) { docs[roomId] = { ...docs[roomId], roomId, ...update.$set }; }
    };
}

// Browser engine: the installed Chrome by default. `npm run test:e2e:firefox` and
// `test:e2e:webkit` use Playwright's own builds (`npx playwright-core install firefox webkit`).
const engine = process.env.E2E_BROWSER || (process.env.npm_lifecycle_event || '').split(':')[2] || 'chrome';
const launchers = {
    chrome:  () => chromium.launch({ channel: 'chrome', headless: true }),
    firefox: () => firefox.launch({ headless: true }),
    webkit:  () => webkit.launch({ headless: true })
};

// a phone-sized touch browser; Firefox has no mobile emulation (isMobile)
function phoneContext() {
    return browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: engine !== 'firefox' });
}

let app, browser, baseUrl;

before(async () => {
    app = createServer(memoryModel());
    await new Promise(resolve => app.server.listen(0, resolve));
    baseUrl = `http://localhost:${app.server.address().port}`;
    browser = await launchers[engine]();
});

after(async () => {
    if (browser) await browser.close();
    if (app) {
        app.io.close();
        app.server.close();
    }
});

// a new browser profile (own localStorage), so every user is a different browser
async function openUser() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err));
    page.errors = errors;
    await page.goto(baseUrl);
    return page;
}

async function closeUsers(...pages) {
    for (const page of pages) {
        assert.deepStrictEqual(page.errors.map(String), [], 'no errors in the browser');
        await page.context().close();
    }
}

async function createRoom(page, name, password = '') {
    await page.fill('#usernameInput', name);
    await page.fill('#roomPasswordInput', password);
    await page.click('#landingCreateBtn');
    await page.waitForFunction(() => currentRoomId);
    return page.evaluate(() => currentRoomId);
}

async function joinRoom(page, name, roomId, password = '') {
    await page.fill('#usernameInput', name);
    await page.fill('#roomPasswordInput', password);
    await page.fill('#roomCodeInput', roomId);
    await page.click('#landingJoinBtn');
}

// drag across the canvas between two points given as fractions of its size
async function drag(page, from, to) {
    const box = await page.locator('#canvas').boundingBox();
    const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...at(from));
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
        const f = i / 10;
        await page.mouse.move(...at([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]));
    }
    await page.mouse.up();
}

// RGBA of the canvas pixel at a fraction of its size
function pixel(page, fx, fy) {
    return page.evaluate(([x, y]) =>
        Array.from(ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data), [fx, fy]);
}

// wait until the pixel at a fraction of the canvas matches a test
function waitForPixel(page, fx, fy, check) {
    return page.waitForFunction(([x, y, src]) => {
        const d = ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
        return new Function('d', `return ${src}`)(d);
    }, [fx, fy, check]);
}

const isInk = (rgba) => rgba[3] > 0 && rgba[0] + rgba[1] + rgba[2] < 600;

test('two users: join, draw, chat and undo stay in sync', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId && document.getElementById('userCount').textContent === '2');

    // a horizontal brush stroke through the middle
    await drag(alice, [0.2, 0.5], [0.8, 0.5]);
    await waitForPixel(bob, 0.5, 0.5, 'd[3] > 0');
    assert.ok(isInk(await pixel(bob, 0.5, 0.5)), 'Bob sees the stroke');

    await alice.click('#chatBtn');
    await alice.fill('#chatInput', 'hello bob');
    await alice.press('#chatInput', 'Enter');
    await bob.waitForSelector('#chatMessages .chat-message-text:text("hello bob")', { state: 'attached' }); // popup closed: hidden but there

    // undo is per user: Bob has nothing to undo, Alice's Undo removes her stroke for both
    assert.strictEqual(await bob.locator('#undoBtn').isDisabled(), true, 'Bob has no undo');
    await alice.click('#undoBtn');
    await waitForPixel(alice, 0.5, 0.5, 'd[3] === 0');
    await waitForPixel(bob, 0.5, 0.5, 'd[3] === 0');

    await closeUsers(alice, bob);
});

test('a password room needs the password', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice', 'tulip42');

    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForSelector('#landingError:text("needs a password")');
    await joinRoom(bob, 'Bob', roomId, 'rose99');
    await bob.waitForSelector('#landingError:text("Wrong password")');
    await joinRoom(bob, 'Bob', roomId, 'tulip42');
    await bob.waitForFunction((id) => currentRoomId === id, roomId);

    await closeUsers(alice, bob);
});

test('shapes and fill reach the other user', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    await alice.keyboard.press('r');
    await drag(alice, [0.3, 0.3], [0.7, 0.7]);
    await alice.keyboard.press('f');
    await alice.locator('.color-swatch[data-color="#FF0000"]').click();
    const box = await alice.locator('#canvas').boundingBox();
    await alice.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await waitForPixel(bob, 0.5, 0.5, 'd[0] === 255 && d[1] === 0 && d[2] === 0');
    assert.strictEqual((await pixel(bob, 0.1, 0.1))[3], 0, 'outside the rectangle stays empty');

    await closeUsers(alice, bob);
});

test('a chat flood is cut by the rate limit; history survives in the saved room', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    await alice.evaluate(() => {
        for (let i = 0; i < 50; i++) socket.emit('chat-message', { roomId: currentRoomId, text: 'flood' + i });
    });
    await bob.waitForTimeout(1000);
    const received = await bob.locator('#chatMessages .chat-message').count();
    assert.ok(received >= 8 && received <= 9, `received ${received}`); // burst of 8, maybe one refill

    // everyone leaves: the room and its chat are saved; a new joiner gets the history back
    await closeUsers(alice, bob);
    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(app.roomData[roomId], undefined, 'room left memory');
    const carol = await openUser();
    await joinRoom(carol, 'Carol', roomId);
    await carol.waitForFunction(() => document.querySelectorAll('#chatMessages .chat-message').length > 0);
    assert.strictEqual(await carol.locator('#chatMessages .chat-message').count(), received);
    await closeUsers(carol);
});

// count of pure red pixels, and a checksum of the whole canvas
function canvasSummary(page) {
    return page.evaluate(() => {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0, sum = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] === 255) red++;
            sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) % 1000000007;
        }
        return { width: canvas.width, height: canvas.height, red, sum };
    });
}

test('fixed canvas: same pixels on a phone and a desktop, resizing keeps them', async () => {
    const alice = await openUser();
    const phone = await phoneContext();
    const bob = await phone.newPage();
    bob.errors = [];
    bob.on('pageerror', (err) => bob.errors.push(err));
    await bob.goto(baseUrl);

    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    await alice.keyboard.press('r');
    await drag(alice, [0.25, 0.25], [0.75, 0.75]);
    await alice.keyboard.press('f');
    await alice.locator('.color-swatch[data-color="#FF0000"]').click();
    const box = await alice.locator('#canvas').boundingBox();
    await alice.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitForPixel(bob, 0.5, 0.5, 'd[0] === 255 && d[1] === 0 && d[2] === 0');

    const a = await canvasSummary(alice);
    const b = await canvasSummary(bob);
    assert.deepStrictEqual([a.width, a.height], [1280, 800]);
    assert.deepStrictEqual([b.width, b.height], [1280, 800]);
    assert.ok(a.red > 100000, `red area ${a.red}`);
    assert.ok(Math.abs(a.red - b.red) <= a.red * 0.001, `red pixels: desktop ${a.red}, phone ${b.red}`);

    // resizing the window does not change a single pixel
    await alice.setViewportSize({ width: 700, height: 600 });
    await alice.waitForTimeout(300);
    assert.deepStrictEqual(await canvasSummary(alice), a);

    // a click lands on the canvas pixel under the pointer (border and scaling included)
    const box2 = await alice.locator('#canvas').boundingBox();
    const pos = await alice.evaluate(([x, y]) => toCanvasPos(x, y), [box2.x + 3, box2.y + 3]);
    assert.ok(Math.abs(pos.x) < 0.01 && Math.abs(pos.y) < 0.01, `top-left inside the border maps to 0,0: ${JSON.stringify(pos)}`);

    await closeUsers(alice, bob);
});

// multi-touch goes through the DevTools protocol, which only Chrome has
test('phone: one finger draws, two fingers pinch-zoom without drawing, drawing while zoomed hits the right spot', { skip: engine !== 'chrome' && 'needs Chrome (DevTools protocol)' }, async () => {
    const context = await phoneContext();
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', (err) => page.errors.push(err));
    await page.goto(baseUrl);
    await createRoom(page, 'Phone');
    await page.waitForTimeout(500);

    // real touch events through the DevTools protocol (several fingers at once)
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: points.map(([x, y], id) => ({ x, y, id }))
    });
    const box = await page.locator('#canvas').boundingBox();
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    const inkCount = () => page.evaluate(() => {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
    });

    // one finger: a stroke
    await touch('touchStart', [at(0.2, 0.2)]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [at(0.2 + i * 0.05, 0.2)]);
    await touch('touchEnd', []);
    const afterStroke = await inkCount();
    assert.ok(afterStroke > 0, 'one finger draws');

    // two fingers spread apart around the middle: zoom, and nothing is drawn
    await touch('touchStart', [at(0.45, 0.5)]);
    await touch('touchStart', [at(0.45, 0.5), at(0.55, 0.5)]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [at(0.45 - i * 0.03, 0.5), at(0.55 + i * 0.03, 0.5)]);
    await touch('touchEnd', [at(0.55 + 0.24, 0.5)]);
    await touch('touchEnd', []);
    const scale = await page.evaluate(() => canvasFrame.getBoundingClientRect().width / canvasFrame.offsetWidth);
    assert.ok(scale > 2, `zoomed in (${scale.toFixed(2)}x)`);
    assert.strictEqual(await inkCount(), afterStroke, 'the pinch drew nothing');

    // zoomed in: a tap-and-drag draws exactly under the finger
    const target = [box.x + box.width * 0.5, box.y + box.height * 0.5]; // screen point (now zoomed)
    const expected = await page.evaluate(([x, y]) => toCanvasPos(x, y), target);
    await touch('touchStart', [target]);
    await touch('touchMove', [[target[0] + 4, target[1]]]);
    await touch('touchEnd', []);
    const hit = await page.evaluate(([x, y]) => ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3], [expected.x + 1, expected.y]);
    assert.ok(hit > 0, `ink at canvas ${Math.round(expected.x)},${Math.round(expected.y)}`);

    await closeUsers(page);
});

// pixels with any ink inside a box given as fractions of the canvas
function inkIn(page, x1, y1, x2, y2) {
    return page.evaluate(([a, b, c, d]) => {
        const x = Math.floor(canvas.width * a), y = Math.floor(canvas.height * b);
        const data = ctx.getImageData(x, y, Math.floor(canvas.width * c) - x, Math.floor(canvas.height * d) - y).data;
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
        return n;
    }, [x1, y1, x2, y2]);
}

test('text and an inserted image reach the other user', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    // text: T, click near the top-left, type, Enter
    await alice.keyboard.press('t');
    const box = await alice.locator('#canvas').boundingBox();
    await alice.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.05);
    await alice.waitForSelector('.canvas-text-input');
    await alice.keyboard.type('Hello');
    await alice.keyboard.press('Enter');
    assert.strictEqual(await alice.locator('.canvas-text-input').count(), 0, 'text box closed');
    await bob.waitForFunction(() => {
        const d = ctx.getImageData(0, 0, Math.floor(canvas.width * 0.3), Math.floor(canvas.height * 0.2)).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
        return false;
    });
    assert.ok(await inkIn(bob, 0.05, 0.05, 0.3, 0.2) > 50, 'Bob sees the text');

    // image: a 400x200 blue PNG, picked through the hidden file input
    const png = await alice.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 400; c.height = 200;
        const x = c.getContext('2d');
        x.fillStyle = '#0000ff';
        x.fillRect(0, 0, 400, 200);
        return c.toDataURL('image/png').split(',')[1];
    });
    await alice.setInputFiles('#imageInput', { name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await waitForPixel(bob, 0.5, 0.5, 'd[2] > 200 && d[0] < 40 && d[1] < 40');
    // centered, native size (fits): 400/1280 wide, so 0.3 across is outside it
    assert.strictEqual((await pixel(bob, 0.3, 0.5))[3], 0, 'outside the image stays empty');

    // Escape cancels a text box without drawing
    const before = await inkIn(alice, 0.6, 0.85, 0.99, 0.99);
    await alice.keyboard.press('t');
    await alice.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.9);
    await alice.waitForSelector('.canvas-text-input');
    await alice.keyboard.type('nope');
    await alice.keyboard.press('Escape');
    assert.strictEqual(await inkIn(alice, 0.6, 0.85, 0.99, 0.99), before);

    await closeUsers(alice, bob);
});

test('per-user undo: each user undoes only their own changes; joiners and reconnects agree', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    await drag(alice, [0.1, 0.3], [0.9, 0.3]);  // Alice: line at 30%
    await waitForPixel(bob, 0.5, 0.3, 'd[3] > 0');
    await drag(bob, [0.1, 0.7], [0.9, 0.7]);    // Bob: line at 70%
    await waitForPixel(alice, 0.5, 0.7, 'd[3] > 0');
    await alice.keyboard.press('r');
    await drag(alice, [0.4, 0.45], [0.6, 0.55]); // Alice: a rectangle, her newest change
    await bob.waitForFunction(() => roomHistory.ops.length === 3);

    // Bob's undo takes back his line only, even though Alice drew after him
    await bob.click('#undoBtn');
    for (const page of [alice, bob]) {
        await waitForPixel(page, 0.5, 0.7, 'd[3] === 0');
        assert.ok((await pixel(page, 0.5, 0.3))[3] > 0, 'Alice\'s line stays');
        assert.ok((await pixel(page, 0.4, 0.5))[3] > 0, 'Alice\'s rectangle stays');
    }

    // Alice undoes twice: her rectangle, then her line. Bob's line stays gone.
    await alice.click('#undoBtn');
    await waitForPixel(bob, 0.4, 0.5, 'd[3] === 0');
    await alice.click('#undoBtn');
    await waitForPixel(bob, 0.5, 0.3, 'd[3] === 0');
    await alice.waitForFunction(() => document.getElementById('undoBtn').disabled); // server's history-update

    // Alice redoes her line; Bob redoes his
    await alice.click('#redoBtn');
    await waitForPixel(bob, 0.5, 0.3, 'd[3] > 0');
    await bob.click('#redoBtn');
    await waitForPixel(alice, 0.5, 0.7, 'd[3] > 0');

    // a new joiner sees the same picture: both lines, no rectangle
    const carol = await openUser();
    await joinRoom(carol, 'Carol', roomId);
    await carol.waitForFunction(() => roomHistory.ops.length === 3);
    await waitForPixel(carol, 0.5, 0.3, 'd[3] > 0');
    await waitForPixel(carol, 0.5, 0.7, 'd[3] > 0');
    assert.strictEqual((await pixel(carol, 0.4, 0.5))[3], 0, 'undone rectangle is not drawn');
    assert.strictEqual(await carol.locator('#undoBtn').isDisabled(), true, 'Carol has nothing to undo');

    // Bob reconnects: his undo still works (it follows his browser)
    await bob.evaluate(() => socket.io.engine.close());
    await bob.waitForFunction(() => document.getElementById('toast').textContent.includes('Reconnected'));
    await bob.waitForFunction(() => !document.getElementById('undoBtn').disabled);
    await bob.click('#undoBtn');
    await waitForPixel(carol, 0.5, 0.7, 'd[3] === 0');

    // the saved canvas matches (autosave and joiners use it)
    await alice.waitForTimeout(300);
    const saved = app.roomData[roomId].canvasState;
    assert.match(saved, /^data:image\/(png|webp);base64,/);

    await closeUsers(alice, bob, carol);
});

test('over 200 changes, the oldest are flattened into the base and the picture stays right', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, 'Bob', roomId);
    await bob.waitForFunction(() => currentRoomId);

    // 205 thin horizontal strokes, one per change, at y = i / 250 (sent at the rate limit)
    const COUNT = 205;
    await alice.evaluate(async (count) => {
        for (let i = 1; i <= count; i++) {
            const y = i / 250;
            const op = { type: 'stroke', points: [[0.1, y], [0.9, y]], color: '#000000', ns: 0.003, tool: 'brush' };
            drawOnCommitted(c => drawOp(c, op, canvas.width, canvas.height));
            socket.emit('op', { roomId: currentRoomId, op, state: canvasState() });
            if (i > 15) await new Promise(r => setTimeout(r, 105)); // stay under 10 per second
        }
    }, COUNT);

    // the server asked Alice to flatten; her answer set a new base
    const deadline = Date.now() + 10000;
    while (!app.roomData[roomId].history.baseState && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    const h = app.roomData[roomId].history;
    assert.ok(h.baseState, 'base image set by the flatten');
    assert.strictEqual(h.ops.length, COUNT - 100);
    await bob.waitForFunction((n) => roomHistory.ops.length === n && roomHistory.base, COUNT - 100);

    // Alice undoes her newest stroke: everyone redraws from base + remaining changes
    await alice.click('#undoBtn');
    const yOf = (i) => (Math.floor(800 * i / 250) + 0.5) / 800;
    // Bob's canvas starts empty (these ops came without live strokes), so wait for the rebuild
    await waitForPixel(bob, 0.5, yOf(3), 'd[3] > 0');
    assert.strictEqual((await pixel(bob, 0.5, yOf(COUNT)))[3], 0, 'undone stroke is gone');
    for (const i of [3, 50, 100, 150, 204]) {
        assert.ok((await pixel(bob, 0.5, yOf(i)))[3] > 0, `stroke ${i} still drawn after the rebuild`);
    }
    await closeUsers(alice, bob);
});

test('a canvas over 1 MB (Socket.io default limit) still reaches the server', async () => {
    const alice = await openUser();
    const roomId = await createRoom(alice, 'Alice');
    const big = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
    await alice.evaluate((state) => socket.emit('canvas-state', { roomId: currentRoomId, state }), big);
    const deadline = Date.now() + 5000;
    while (app.roomData[roomId].canvasState !== big && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(app.roomData[roomId].canvasState, big);
    assert.strictEqual(await alice.evaluate(() => socket.connected), true, 'still connected');
    await closeUsers(alice);
});

test('kick blocks a private window; members reopen a password room and keep their undo', async () => {
    const alice = await openUser();
    const bob = await openUser();
    const roomId = await createRoom(alice, 'Alice', 'tulip42');
    await joinRoom(bob, 'Bob', roomId, 'tulip42');
    await alice.waitForFunction(() => document.getElementById('userCount').textContent === '2');
    await drag(alice, [0.2, 0.5], [0.8, 0.5]);
    await waitForPixel(bob, 0.5, 0.5, 'd[3] > 0');

    // host kicks Bob from the members list
    await alice.click('#membersBtn');
    await alice.click('.member-kick-btn');
    await alice.click('#kickConfirmBtn');
    await bob.waitForFunction(() => !currentRoomId);

    // Bob in a private window (new browser id, same IP) with the right password: still out
    const bobPrivate = await openUser();
    await joinRoom(bobPrivate, 'Bob', roomId, 'tulip42');
    await bobPrivate.waitForSelector('#landingError:text("the host removed you")');

    // host sets a new password through the members list (the kick closed it)
    alice.once('dialog', (dialog) => dialog.accept('daisy7'));
    await alice.click('#membersBtn');
    await alice.click('#setPasswordBtn');
    await alice.waitForFunction(() => document.getElementById('toast').textContent.includes('New password set'));

    // Alice leaves: the room is saved and leaves memory. She forgot the password, but her
    // browser got in before, so she reopens it without one, and can still undo her stroke.
    await alice.click('#exitRoomBtn');
    const deadline = Date.now() + 5000;
    while (app.roomData[roomId] && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(app.roomData[roomId], undefined, 'room left memory');
    await alice.waitForSelector('#landingScreen', { state: 'visible' });
    // Enter instead of a click: the landing card is still animating back in
    await alice.fill('#roomCodeInput', roomId);
    await alice.press('#roomCodeInput', 'Enter');
    await alice.waitForFunction((id) => currentRoomId === id, roomId);
    await waitForPixel(alice, 0.5, 0.5, 'd[3] > 0');
    await alice.waitForFunction(() => !document.getElementById('undoBtn').disabled);
    await alice.click('#undoBtn');
    await waitForPixel(alice, 0.5, 0.5, 'd[3] === 0');

    await closeUsers(alice, bob, bobPrivate);
});
