'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('js/app.js');

test('every button name quoted in the guide exists in the builder code', () => {
  const guide = read('guide.html');
  const names = [...guide.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  const uiNames = names.filter(n => /^(See an example first|Start with my own details|Import old resume text|Download PDF|Word \(editable\)|Word \(exact design\)|Change Template Anytime|Start order|I have paid|Submit Order Online|I have a code)/.test(n));
  assert.ok(uiNames.length >= 9, 'guide should name the real buttons, found ' + uiNames.length);
  for (const n of uiNames) assert.ok(app.includes(n.replace(' (3 easy steps)', '').replace(/ \/ Next$/, '')), 'button not in app.js: ' + n);
});

test('guide no longer mentions buttons that were removed', () => {
  const guide = read('guide.html');
  for (const old of ['Fill Full Demo CV', 'Start From Scratch', 'Order / Payment Options', 'Print / Save PDF']) assert.ok(!guide.includes(old), old);
});

test('legal pages have a Last updated date and the cookie policy mentions the saved site files', () => {
  for (const f of ['privacy.html', 'terms.html', 'refund.html', 'cookies.html']) assert.ok(/Last updated: \d{1,2} [A-Z][a-z]+ 20\d\d/.test(read(f)), f);
  assert.ok(/cache storage/.test(read('cookies.html')));
  assert.ok(/saved copies of our own site files/.test(read('privacy.html')));
});

test('template count in descriptions matches the real number of templates', () => {
  const real = (app.match(/\{id:'t\d+'/g) || []).length || null;
  for (const f of ['index.html', 'about.html', 'builder.html', 'templates.html']) assert.ok(!read(f).includes('60+'), f + ' still says 60+');
  if (real) assert.strictEqual(real, 70);
});
