const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('offer banner is present on every page that shows prices or takes orders', () => {
  for (const f of ['index.html', 'templates.html', 'pricing.html']) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes('id="offerBanner"'), f);
  assert.ok(app.includes('<div id="offerBanner"></div><div class="paywall"'), 'builder has a banner slot');
  assert.ok(/function fullRender\(\)\{[^}]*renderOffer\(\)/.test(app), 'banner is redrawn after every builder re-render');
});
test('admin blocks saving a broken offer and explains why', () => {
  for (const s of ['function offerProblems()', 'bari honi chahiye', 'guzar chuki', 'offerProblems();\n  if(__op.err.length)']) assert.ok(admin.includes(s), s);
  assert.ok(admin.indexOf('offerProblems();\n  if(__op.err.length)') < admin.indexOf("api({action:'saveSiteSettings'") || !admin.includes("api({action:'saveSiteSettings'"), 'check runs before the save request');
});
test('offer logic in app.js: expiry, percentage', () => {
  const ctx = {}; new Function('ctx', app.match(/function firstNum[^\n]*\n/)[0] + app.match(/function offerActive[^\n]*\n/)[0] + app.match(/function offerPct[^\n]*\n/)[0] + 'ctx.a=offerActive;ctx.p=offerPct;')(ctx);
  assert.strictEqual(ctx.p('Rs. 500', 'Rs. 400'), 20);
  assert.strictEqual(ctx.p('Rs. 400', 'Rs. 500'), 0);
  assert.strictEqual(ctx.a({ enabled: true, ends: '2000-01-01' }), false);
  assert.strictEqual(ctx.a({ enabled: true, ends: '2999-01-01' }), true);
  assert.strictEqual(ctx.a({ enabled: false, ends: '2999-01-01' }), false);
});
