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

test('public pages link the manifest and register the worker; admin and 404 do not', () => {
  for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const has = s.includes('rel="manifest"') && s.includes('js/pwa.js');
    if (f === 'admin.html' || f === '404.html') assert.ok(!has, f + ' must not be part of the app');
    else assert.ok(has, f + ' is missing the manifest or pwa.js');
  }
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
