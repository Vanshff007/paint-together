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
