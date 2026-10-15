const { test } = require('node:test');
const assert = require('node:assert');
const { allowRequest } = require('./server');

function check(headers) {
    let result;
    allowRequest({ headers }, (err, ok) => { result = ok; });
    return result;
}

test('same host is allowed, on any scheme or port', () => {
    assert.strictEqual(check({ host: 'paint.example', origin: 'https://paint.example' }), true);
    assert.strictEqual(check({ host: 'localhost:3000', origin: 'http://localhost:3000' }), true);
});

test('other sites are rejected', () => {
    assert.strictEqual(check({ host: 'paint.example', origin: 'https://evil.example' }), false);
    assert.strictEqual(check({ host: 'paint.example', origin: 'https://paint.example.evil.example' }), false);
    assert.strictEqual(check({ host: 'localhost:3000', origin: 'http://localhost:4000' }), false);
});

test('a missing Origin (non-browser client) is allowed', () => {
    assert.strictEqual(check({ host: 'paint.example' }), true);
});

test('"null" and malformed origins are rejected', () => {
    assert.strictEqual(check({ host: 'paint.example', origin: 'null' }), false);
    assert.strictEqual(check({ host: 'paint.example', origin: 'not a url' }), false);
});
