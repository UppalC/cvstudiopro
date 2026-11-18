'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.slice(1, 4).toString(), 'PNG', file + ' is not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest has the fields Chrome needs to offer install', () => {
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(manifest.start_url);
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.notStrictEqual(manifest.prefer_related_applications, true);
  assert.ok(manifest.icons.some(i => i.sizes === '192x192'));
  assert.ok(manifest.icons.some(i => i.sizes === '512x512'));
});

test('manifest uses relative paths so it works under /cvstudiopro/', () => {
  for (const u of [manifest.start_url, manifest.scope, manifest.id]) assert.ok(!u.startsWith('/'), u);
  for (const i of manifest.icons) assert.ok(!i.src.startsWith('/') && !/^https?:/.test(i.src), i.src);
});

test('every icon file exists with the size the manifest claims', () => {
  for (const i of manifest.icons) {
    const [w, h] = pngSize(path.join(root, i.src));
    assert.strictEqual(w + 'x' + h, i.sizes, i.src);
  }
  assert.deepStrictEqual(pngSize(path.join(root, 'img/icon-180.png')), [180, 180]);
});

test('start_url and shortcuts point to real files', () => {
  const targets = [manifest.start_url].concat((manifest.shortcuts || []).map(s => s.url));
  for (const t of targets) assert.ok(fs.existsSync(path.join(root, t.split('?')[0])), t);
});

test('public pages link the public manifest; admin links its own admin manifest; 404 has none', () => {
  for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    if (f === '404.html') { assert.ok(!s.includes('rel="manifest"'), '404 must not link a manifest'); continue; }
    if (f === 'admin.html') {
      assert.ok(s.includes('href="admin-manifest.webmanifest"') && !s.includes('href="manifest.webmanifest"'), 'admin must use only the admin manifest');
      assert.ok(s.includes('js/pwa.js'));
      continue;
    }
    assert.ok(s.includes('href="manifest.webmanifest"') && s.includes('js/pwa.js'), f + ' is missing the manifest or pwa.js');
  }
});

test('admin manifest is a separate app: own id, scope limited to admin.html, own icons', () => {
  const a = JSON.parse(fs.readFileSync(path.join(root, 'admin-manifest.webmanifest'), 'utf8'));
  assert.notStrictEqual(a.id, manifest.id);
  assert.strictEqual(a.start_url, './admin.html?source=pwa');
  assert.strictEqual(a.scope, './admin.html');
  assert.strictEqual(a.display, 'standalone');
  for (const i of a.icons) { const [w, h] = pngSize(path.join(root, i.src)); assert.strictEqual(w + 'x' + h, i.sizes, i.src); }
  assert.deepStrictEqual(pngSize(path.join(root, 'img/icon-admin-180.png')), [180, 180]);
  assert.ok(!JSON.stringify(a).match(/token|secret|api[_-]?key|script\.google/i), 'admin manifest must hold no secrets');
});

test('service worker never touches admin, other origins, or non-GET requests', () => {
  const s = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(/admin/.test(s) && /url\.origin !== self\.location\.origin/.test(s) && /req\.method !== 'GET'/.test(s));
});

test('every file the worker pre-caches exists', () => {
  const s = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const core = eval(s.match(/const CORE = (\[[\s\S]*?\]);/)[1]);
  for (const f of core) if (f !== './') assert.ok(fs.existsSync(path.join(root, f)), f);
});
