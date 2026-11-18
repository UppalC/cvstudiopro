const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));

test('every page uses the new brand favicon (svg + png + ico, cache-busted) and none the old blue one', () => {
  for (const f of pages) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const base = f === 'admin.html' ? 'favicon-admin' : 'favicon';
    for (const ext of ['svg', 'ico']) assert.ok(s.includes(`href="${base}.${ext}?v=2"`), `${f} missing ${base}.${ext}`);
    assert.ok(s.includes(`href="${base}-32.png?v=2"`), `${f} missing png`);
    assert.ok(!/href="favicon\.svg"/.test(s), `${f} still has the old uncached-name link`);
  }
});
test('favicon files exist, are valid, and the old blue colour is gone', () => {
  for (const f of ['favicon.svg', 'favicon-admin.svg', 'favicon-32.png', 'favicon-admin-32.png', 'favicon.ico', 'favicon-admin.ico']) assert.ok(fs.statSync(path.join(root, f)).size > 100, f);
  assert.ok(!fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8').includes('#1d4ed8'));
  const png = fs.readFileSync(path.join(root, 'favicon-32.png'));
  assert.strictEqual(png.readUInt32BE(16), 32);
  const ico = fs.readFileSync(path.join(root, 'favicon.ico'));
  assert.strictEqual(ico.readUInt16LE(2), 1); assert.ok(ico.readUInt16LE(4) >= 1);
});
test('service worker precaches the new favicon and uses a new cache version', () => {
  const s = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(s.includes("'favicon-32.png'") && s.includes("VERSION = 'v2'"));
});
