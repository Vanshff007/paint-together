const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SITE_URL = 'https://paint-together-hchq.onrender.com';
const staticDir = path.join(__dirname, 'static');
const read = (file) => fs.readFileSync(path.join(staticDir, file), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');

// Width and height from a PNG header
function pngSize(file) {
    const buf = fs.readFileSync(path.join(staticDir, file));
    assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('robots.txt allows the site, blocks room links, and points to the sitemap', () => {
    const robots = read('robots.txt');
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Disallow: \/\*\?room=$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${SITE_URL}/sitemap\\.xml$`, 'm'));
});

test('sitemap.xml lists the home page', () => {
    const sitemap = read('sitemap.xml');
    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.ok(sitemap.includes(`<loc>${SITE_URL}/</loc>`));
});

test('llms.txt has a title, a summary, and a link to the live app', () => {
    const llms = read('llms.txt');
    assert.match(llms, /^# Paint Together\n/);
    assert.match(llms, /^> .+/m);
    assert.ok(llms.includes(`(${SITE_URL}/)`));
});

test('site.webmanifest is valid JSON and its icons exist', () => {
    const manifest = JSON.parse(read('site.webmanifest'));
    assert.strictEqual(manifest.name, 'Paint Together');
    for (const icon of manifest.icons) {
        assert.ok(fs.existsSync(path.join(staticDir, icon.src)), `missing ${icon.src}`);
    }
});

test('images have the sizes that link previews and iOS expect', () => {
    assert.deepStrictEqual(pngSize('og-image.png'), [1200, 630]);
    assert.deepStrictEqual(pngSize('apple-touch-icon.png'), [180, 180]);
    assert.match(read('favicon.svg'), /^<svg /);
});

test('every root file linked from index.html exists in static/', () => {
    const links = [...html.matchAll(/(?:href|content)="(?:https:\/\/paint-together-hchq\.onrender\.com)?\/([\w.-]+\.(?:png|svg|webmanifest))"/g)]
        .map(m => m[1]);
    assert.ok(links.includes('og-image.png'));
    assert.ok(links.includes('favicon.svg'));
    for (const file of links) {
        assert.ok(fs.existsSync(path.join(staticDir, file)), `index.html links missing /${file}`);
    }
});

test('index.html has the description and Open Graph tags', () => {
    for (const tag of ['name="description"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"']) {
        assert.ok(html.includes(tag), `missing ${tag}`);
    }
});
