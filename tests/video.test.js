const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('guide page has the built-in video slot and the files exist', () => {
  assert.ok(/id="demoVideoBox"[^>]*data-local/.test(read('guide.html')));
  for (const f of ['video/guide-video.mp4', 'video/guide-poster.jpg', 'video/guide-video.ur.vtt']) assert.ok(fs.statSync(path.join(root, f)).size > 1000, f);
  const mp4 = fs.readFileSync(path.join(root, 'video/guide-video.mp4'));
  assert.ok(mp4.subarray(4, 8).toString() === 'ftyp', 'is a real mp4');
  assert.ok(mp4.length < 6 * 1024 * 1024, 'small enough for phones');
});
test('Urdu subtitle file is valid WebVTT with ordered, non-overlapping cues', () => {
  const v = read('video/guide-video.ur.vtt');
  assert.ok(v.startsWith('WEBVTT'));
  const t = x => { const m = x.match(/(\d+):(\d+):(\d+\.\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
  const cues = [...v.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n([^\n]+)/g)];
  assert.ok(cues.length >= 20);
  let prev = 0;
  for (const c of cues) { assert.ok(t(c[1]) >= prev && t(c[2]) > t(c[1]), c[0]); assert.ok(/[\u0600-\u06FF]/.test(c[3])); prev = t(c[2]); }
});
test('service worker never stores video or range requests', () => {
  const s = read('sw.js');
  assert.ok(/headers\.has\('range'\)/.test(s) && /mp4\|webm\|vtt/.test(s));
});
test('site-config falls back to the built-in video and lets a YouTube link win', () => {
  const s = read('js/site-config.js');
  assert.ok(s.includes("hasAttribute('data-local')") && s.includes('guide-video.mp4') && s.includes("t.srclang='ur'"));
});
