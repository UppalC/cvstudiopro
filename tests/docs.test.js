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

test('guide explains how to add the site to the phone home screen', () => {
  const g = read('guide.html');
  assert.ok(/Add to Home screen/.test(g) && /Add to Home Screen/.test(g) && /Install app/.test(g));
});

test('terms say how offers work (Premium only, price at checkout) and the date is current', () => {
  const s = read('terms.html');
  assert.ok(/offer applies to the Premium CV price only/.test(s) && /price shown at checkout/.test(s));
  assert.ok(s.includes('Last updated: 26 November 2026'));
});

test('claims window and record keeping are stated consistently (30 days, 36 months)', () => {
  const r = read('refund.html'), p = read('privacy.html'), t = read('terms.html');
  assert.ok(/within 30 days of the date we email your access code/.test(r) && /does not take away any right you have under the law/.test(r));
  assert.ok(/up to 36 months/.test(p) && /transaction record without your name/.test(p) && !/up to 12 months/.test(p));
  assert.ok(/must be reported within 30 days/.test(t));
  for (const s of [r, p, t]) assert.ok(s.includes('Last updated: 26 November 2026'));
  const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
  assert.ok(/CLAIM_DAYS = 30/.test(code) && /RETENTION_MONTHS = 36/.test(code), 'Code.gs uses the same numbers as the public pages');
});
