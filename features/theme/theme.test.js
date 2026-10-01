const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const { version } = require(path.join(root, 'package.json'));
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('package.json version is MAJOR.MINOR.PATCH', () => {
    assert.match(version, /^\d+\.\d+\.\d+$/);
});

test('landing title bar shows the package.json version', () => {
    const shown = css.match(/Paint Together\s+—\s+v(\d+\.\d+\.\d+)/);
    assert.ok(shown, 'version not found in .landing-card::before content');
    assert.strictEqual(shown[1], version);
});
