'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no size in ' + file);
}

test('all pages that have og:image use the same existing 1200x630 image under 300 KB', () => {
  const seen = new Set();
  for (const f of pages) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const m = s.match(/property="og:image" content="([^"]+)"/);
    if (!m) continue;
    const t = s.match(/name="twitter:image" content="([^"]+)"/);
    assert.ok(t && t[1] === m[1], f + ': twitter:image must match og:image');
    seen.add(m[1]);
  }
  assert.strictEqual(seen.size, 1, 'pages use different share images: ' + [...seen]);
  const url = [...seen][0];
  const file = path.join(root, url.replace(/^https:\/\/uppalc\.github\.io\/cvstudiopro\//, ''));
  assert.ok(fs.existsSync(file), file + ' is missing');
  assert.deepStrictEqual(jpegSize(file), [1200, 630]);
  assert.ok(fs.statSync(file).size < 300 * 1024, 'image is bigger than 300 KB (WhatsApp may skip it)');
});

test('width and height meta match the real image', () => {
  for (const f of pages) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    if (!s.includes('og:image"')) continue;
    assert.ok(s.includes('og:image:width" content="1200"') && s.includes('og:image:height" content="630"'), f);
  }
});
