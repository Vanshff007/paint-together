// Browser smoke tests: two real Chrome windows against the real server code,
// with an in-memory Room model instead of MongoDB. Run with `npm run test:e2e`.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright-core');
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

let app, browser, baseUrl;

before(async () => {
    app = createServer(memoryModel());
    await new Promise(resolve => app.server.listen(0, resolve));
    baseUrl = `http://localhost:${app.server.address().port}`;
    // the installed Chrome, so no browser download is needed
    browser = await chromium.launch({ channel: 'chrome', headless: true });
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

    // Bob undoes it; both canvases are empty there again
    await bob.click('#undoBtn');
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
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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

test('phone: one finger draws, two fingers pinch-zoom without drawing, drawing while zoomed hits the right spot', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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
