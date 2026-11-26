/**
 * CV Studio Pro — Backend (Google Apps Script Web App)  —  v2 (hardened)
 *
 * Deploy as Web App:  Execute as: Me   |   Who has access: Anyone
 * (After editing: Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *  The /exec URL stays the same.)
 *
 * Sheet tabs:
 *   Codes       A=code, B=used, C=note, D=date used
 *   OwnerLogin  A2 = owner password (plain text is auto-converted to a salted hash on first login)
 *   Settings    A=key, B=value
 *   Orders      A=timestamp, B=name, C=whatsapp, D=email, E=template, F=note, G=status, H=code, I=updated,
 *               J=reminded, K=transaction id, L=price/offer shown at order time, M=HOLD (kept for a dispute)
 *   AuditLog    (auto-created) Time, Order, Event, Details  - append-only history of every order action
 *   Evidence    (auto-created) Saved at, Order, JSON snapshot of the order + its AuditLog + code status
 *
 * Security notes:
 *   - Owner password is stored as a salted hash (h1$salt$hash) after first successful login.
 *     To reset it: type a NEW plain password into OwnerLogin!A2 — it is hashed on next login.
 *   - Failed owner logins are throttled (5 fails => 15 min lock). Failed customer-code checks are throttled globally.
 *   - Login returns a random session token (valid 6 h); the admin page never stores the password.
 *   - Orders are rate limited and cleaned to stop spam and spreadsheet formula injection.
 *   - The SHEET_ID below is a placeholder in the GitHub copy. Real ID lives only in the deployed script.
 */

const SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';
const CODES_TAB = 'Codes';
const OWNER_TAB = 'OwnerLogin';
const SETTINGS_TAB = 'Settings';
const ORDERS_TAB = 'Orders';
const AUDIT_TAB = 'AuditLog';
const EVIDENCE_TAB = 'Evidence';
const RETENTION_MONTHS = 36;     // personal details are kept this long; after it they are erased (unless HOLD)
const CLAIM_DAYS = 30;           // customers are told to report problems within this many days
const POLICY_VERSION = '2026-11-25'; // which Refund/Terms text was live (written into the audit log)

const STATUSES = ['Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];
const OWNER_MAX_FAILS = 8;       // wrong owner passwords before lock
const OWNER_LOCK_SECONDS = 900;  // 15 minutes
const CODE_MAX_FAILS = 150;       // wrong customer codes (all users together) per window
const CODE_LOCK_SECONDS = 600;   // 10 minutes
const SESSION_SECONDS = 21600;   // 6 hours (maximum CacheService allows)
const MIN_PASSWORD_LENGTH = 12;
const MAX_ORDERS_PER_HOUR = 40;
const REMINDER_COOLDOWN_HOURS = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------------- entry point ---------------- */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'verifyCustomer': return respond(verifyCustomerCode(body.code));
      case 'verifyOwner':    return respond(ownerLogin(body.password));
      case 'getSettings':    return respond(getSettings());
      case 'getPayment':     return respond(getPayment());
      case 'submitOrder':    return respond(submitOrder(body));
      case 'getOrders':      return respond(withOwner(body, function () { return getOrders(); }));
      case 'approveOrder':   return respond(withOwner(body, function () { return approveOrder(body.rowIndex); }));
      case 'updateStatus':   return respond(withOwner(body, function () { return updateStatus(body.rowIndex, body.status); }));
      case 'updateSetting':  return respond(withOwner(body, function () { return updateSetting(body.key, body.value); }));
      case 'saveSiteSettings': return respond(withOwner(body, function () { return saveSiteSettings(body.values, body.password); }));
      case 'updateOrderEmail': return respond(withOwner(body, function () { return updateOrderEmail(body.rowIndex, body.email); }));
      case 'generateCodes':  return respond(withOwner(body, function () { return generateCodes(body.count); }));
      case 'sendReminder':   return respond(withOwner(body, function () { return sendReminder(body.rowIndex, body.via); }));
      case 'resendCode':     return respond(withOwner(body, function () { return resendCode(body.rowIndex); }));
      case 'purgeOldOrders': return respond(withOwner(body, function () { return purgeOldOrders(body.months, body.dryRun === true); }));
      case 'setHold':        return respond(withOwner(body, function () { return setHold(body.rowIndex, body.on === true); }));
      case 'saveEvidence':   return respond(withOwner(body, function () { return saveEvidence(body.rowIndex); }));
      case 'changePassword': return respond(changeOwnerPassword(body.oldPassword, body.newPassword));
      case 'logout':         return respond(logoutOwner(body.token));
      default:               return respond({ valid: false, error: 'unknown_action' });
    }
  } catch (err) {
    return respond({ valid: false, error: 'server_error' });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- helpers: throttling ---------------- */

function failKey(name) { return 'fail_' + name; }

function getFails(name) {
  return Number(CacheService.getScriptCache().get(failKey(name)) || 0);
}

function addFail(name, seconds) {
  CacheService.getScriptCache().put(failKey(name), String(getFails(name) + 1), seconds);
}

function clearFails(name) {
  CacheService.getScriptCache().remove(failKey(name));
}

/* ---------------- helpers: hashing ---------------- */

function toHex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPw(pw, salt) {
  let h = salt + ':' + pw;
  for (let i = 0; i < 500; i++) {
    h = toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt + pw, Utilities.Charset.UTF_8));
  }
  return h;
}

function makeHash(pw) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return 'h1$' + salt + '$' + hashPw(pw, salt);
}

function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------------- owner auth ---------------- */

function verifyOwnerPassword(password) {
  password = String(password || '');
  if (!password) return { valid: false };
  if (getFails('owner') >= OWNER_MAX_FAILS) return { valid: false, error: 'locked' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OWNER_TAB);
  if (!sheet) return { valid: false, error: 'no_owner_tab' };
  const cell = sheet.getRange('A2');
  const stored = String(cell.getValue() || '');
  let ok = false;
  if (stored.indexOf('h1$') === 0) {
    const parts = stored.split('$');
    ok = parts.length === 3 && safeEq(hashPw(password, parts[1]), parts[2]);
  } else if (stored) {
    ok = safeEq(password, stored);
    if (ok) { // upgrade plain text to a salted hash
      cell.setNumberFormat('@');
      cell.setValue(makeHash(password));
    }
  }
  if (ok) { clearFails('owner'); return { valid: true }; }
  addFail('owner', OWNER_LOCK_SECONDS);
  if (getFails('owner') === OWNER_MAX_FAILS) {
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'CV Studio: owner login locked',
        'Owner login was locked for ' + (OWNER_LOCK_SECONDS / 60) + ' minutes after ' + OWNER_MAX_FAILS + ' wrong passwords. If this was not you, someone is trying to guess your password: change it (Google Sheet > OwnerLogin > A2) and check your Google account security.');
    } catch (e) { Logger.log('lock alert failed: ' + e); }
  }
  return { valid: false };
}

function ownerLogin(password) {
  const r = verifyOwnerPassword(password);
  if (!r.valid) return r;
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok_' + token, getTokenVersion(), SESSION_SECONDS);
  return { valid: true, token: token };
}

function getTokenVersion() {
  return PropertiesService.getScriptProperties().getProperty('tokenVersion') || '1';
}

function bumpTokenVersion() {
  PropertiesService.getScriptProperties().setProperty('tokenVersion', String(Date.now()));
}

function validToken(token) {
  token = String(token || '');
  if (token.length < 32) return false;
  const v = CacheService.getScriptCache().get('tok_' + token);
  return !!v && v === getTokenVersion();
}

function logoutOwner(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + String(token));
  return { valid: true };
}

/** Runs fn only for a logged-in owner (session token, or password as a fallback for older pages). */
function withOwner(body, fn) {
  if (body.token) {
    if (!validToken(body.token)) return { valid: false, error: 'session_expired' };
    return fn();
  }
  if (body.password) {
    const r = verifyOwnerPassword(body.password);
    if (!r.valid) return { valid: false, error: r.error || 'wrong_password' };
    return fn();
  }
  return { valid: false, error: 'session_expired' };
}

function changeOwnerPassword(oldPassword, newPassword) {
  const check = verifyOwnerPassword(oldPassword);
  if (!check.valid) return { valid: false, error: check.error || 'wrong_password' };
  newPassword = String(newPassword || '').trim();
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { valid: false, error: 'password_too_short' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OWNER_TAB);
  if (!sheet) return { valid: false, error: 'no_owner_tab' };
  const cell = sheet.getRange('A2');
  cell.setNumberFormat('@');
  cell.setValue(makeHash(newPassword));
  bumpTokenVersion(); // signs out every other session
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok_' + token, getTokenVersion(), SESSION_SECONDS);
  return { valid: true, token: token };
}

/* ---------------- customer codes ---------------- */

function verifyCustomerCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!code || code.length > 60) return { valid: false };
  if (getFails('code') >= CODE_MAX_FAILS) return { valid: false, reason: 'too_many' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CODES_TAB);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowCode = String(data[i][0]).trim().toUpperCase();
      if (rowCode !== '' && rowCode === code) {
        const used = data[i][1];
        if (used === true || String(used).toUpperCase() === 'TRUE' || String(used).toUpperCase() === 'USED') {
          return { valid: false, reason: 'used' };
        }
        sheet.getRange(i + 1, 2).setValue(true);
        sheet.getRange(i + 1, 4).setValue(new Date());
        clearFails('code');
        return { valid: true };
      }
    }
  } finally {
    lock.releaseLock();
  }
  addFail('code', CODE_LOCK_SECONDS);
  return { valid: false, reason: 'not_found' };
}

/* ---------------- settings ---------------- */

// Only these keys are ever shown to the public or accepted from the admin page.
const PUBLIC_KEYS = ['site_name', 'demo_video', 'tpl_free', 'tpl_premium', 'whatsapp', 'email', 'offer_enabled', 'offer_text', 'free_trial_mode',
  'free_trial_ends', 'show_prices', 'price_premium', 'price_expert', 'price_note', 'price_old', 'offer_ends', 'offer_style', 'offer_badge', 'pay_note',
  'pay1_name', 'pay1_title', 'pay1_number', 'pay1_note',
  'pay2_name', 'pay2_title', 'pay2_number', 'pay2_note',
  'pay3_name', 'pay3_title', 'pay3_number', 'pay3_note'];
const QR_KEYS = ['pay1_qr', 'pay2_qr', 'pay3_qr'];
const SENSITIVE_KEYS = ['whatsapp', 'email', 'pay1_name', 'pay1_title', 'pay1_number', 'pay2_name', 'pay2_title', 'pay2_number', 'pay3_name', 'pay3_title', 'pay3_number', 'pay1_qr', 'pay2_qr', 'pay3_qr'];
const MAX_QR_CHARS = 45000;

function readSettingsMap() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS_TAB);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    if (key) map[key] = (typeof data[i][1] === 'string') ? data[i][1].trim() : String(data[i][1] === undefined || data[i][1] === null ? '' : data[i][1]);
  }
  return map;
}

/** Public: only allow-listed keys; QR images are NOT included (see getPayment). */
function getSettings() {
  const map = readSettingsMap();
  if (!map) return { valid: false, error: 'no_settings_tab' };
  const settings = {};
  PUBLIC_KEYS.forEach(function (k) { if (map[k] !== undefined) settings[k] = map[k]; });
  QR_KEYS.forEach(function (k) { settings[k + '_set'] = map[k] ? 'true' : 'false'; });
  return { valid: true, settings: settings };
}

/** Public: payment details + QR images (loaded only when the order window opens). */
function getPayment() {
  const map = readSettingsMap();
  if (!map) return { valid: false, error: 'no_settings_tab' };
  const slots = [];
  for (let n = 1; n <= 3; n++) {
    const qr = map['pay' + n + '_qr'] || '';
    const item = {
      name: map['pay' + n + '_name'] || '',
      title: map['pay' + n + '_title'] || '',
      number: map['pay' + n + '_number'] || '',
      note: map['pay' + n + '_note'] || '',
      qr: isValidQr(qr) ? qr : ''
    };
    if (item.name || item.title || item.number || item.qr) slots.push(item);
  }
  return { valid: true, slots: slots, note: map['pay_note'] || '' };
}

function isValidQr(v) {
  return typeof v === 'string' && v.length <= MAX_QR_CHARS && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(v);
}

function writeSettingValue(sheet, data, key, value) {
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      const cell = sheet.getRange(i + 1, 2);
      cell.setNumberFormat('@');           // keep leading zeros (03xx...) as text
      cell.setValue(value);
      return;
    }
  }
  sheet.appendRow([key, '']);
  const cell = sheet.getRange(sheet.getLastRow(), 2);
  cell.setNumberFormat('@');
  cell.setValue(value);
}

function cleanSettingValue(key, raw) {
  let v = String(raw === undefined || raw === null ? '' : raw);
  if (QR_KEYS.indexOf(key) >= 0) {
    v = v.trim();
    if (v === '') return { ok: true, value: '' };
    return isValidQr(v) ? { ok: true, value: v } : { ok: false, error: 'bad_qr' };
  }
  if (key === 'whatsapp') {
    let d = v.replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.charAt(0) === '0') d = '92' + d.slice(1);
    if (d.length < 8 || d.length > 15) return { ok: false, error: 'bad_whatsapp' };
    return { ok: true, value: d };
  }
  if (key === 'email') {
    v = v.trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v) || v.length > 120) return { ok: false, error: 'bad_email' };
    return { ok: true, value: v };
  }
  if (key === 'show_prices' || key === 'offer_enabled' || key === 'free_trial_mode') {
    return { ok: true, value: (String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes') ? 'true' : 'false' };
  }
  if (key === 'offer_ends' || key === 'free_trial_ends') {
    v = v.trim();
    if (v === '') return { ok: true, value: '' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: 'bad_date' };
    const d = new Date(v + 'T00:00:00Z');
    if (isNaN(d.getTime())) return { ok: false, error: 'bad_date' };
    return { ok: true, value: v };
  }
  if (key === 'offer_style') {
    v = v.trim().toLowerCase();
    return { ok: true, value: ['gold', 'purple', 'green', 'red', 'blue'].indexOf(v) >= 0 ? v : 'gold' };
  }
  if (key === 'site_name') {
    v = v.replace(/[<>]/g, '').trim();
    return { ok: true, value: cleanCell(v, 40) };
  }
  if (key === 'tpl_free' || key === 'tpl_premium') {
    const ids = v.split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return /^t\d{1,3}$/.test(x); });
    return { ok: true, value: ids.join(',').slice(0, 900) };
  }
  if (key === 'demo_video') {
    v = v.trim();
    if (v === '') return { ok: true, value: '' };
    if (v.length > 300 || !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|drive\.google\.com)\//.test(v)) return { ok: false, error: 'bad_video' };
    return { ok: true, value: v };
  }
  if (key === 'offer_badge') return { ok: true, value: cleanCell(v, 30) };
  const max = (key === 'offer_text' || key === 'price_note' || key === 'pay_note' || /_note$/.test(key)) ? 300 : 80;
  return { ok: true, value: cleanCell(v, max) };
}

/** Owner only. Needs the owner password again (step-up) so a stolen session cannot redirect payments. */
function saveSiteSettings(values, password) {
  if (!values || typeof values !== 'object') return { valid: false, error: 'bad_values' };
  const check = verifyOwnerPassword(password);
  if (!check.valid) return { valid: false, error: check.error === 'locked' ? 'locked' : 'wrong_password' };
  const allowed = PUBLIC_KEYS.concat(QR_KEYS);
  const clean = {};
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (allowed.indexOf(k) < 0) return { valid: false, error: 'bad_key' };
    const r = cleanSettingValue(k, values[k]);
    if (!r.ok) return { valid: false, error: r.error, key: k };
    clean[k] = r.value;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  const changed = [];
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS_TAB);
    if (!sheet) return { valid: false, error: 'no_settings_tab' };
    const data = sheet.getDataRange().getValues();
    const old = {};
    for (let i = 1; i < data.length; i++) old[String(data[i][0]).trim()] = String(data[i][1] === undefined || data[i][1] === null ? '' : data[i][1]).trim();
    Object.keys(clean).forEach(function (k) {
      if ((old[k] || '') !== clean[k]) { writeSettingValue(sheet, data, k, clean[k]); changed.push(k); }
    });
  } finally {
    lock.releaseLock();
  }
  const sens = changed.filter(function (k) { return SENSITIVE_KEYS.indexOf(k) >= 0; });
  if (sens.length) {
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'CV Studio: payment/contact settings changed',
        'These important settings were changed from the owner panel just now: ' + sens.join(', ') + '.\n\nIf this was not you, change your owner password immediately (Google Sheet > OwnerLogin > A2) and check your Google account security.');
    } catch (e) { Logger.log('settings alert failed: ' + e); }
  }
  return { valid: true, changed: changed };
}

function updateSetting(key, value) {
  key = String(key || '').trim();
  if (PUBLIC_KEYS.indexOf(key) < 0) return { valid: false, error: 'bad_key' };
  if (SENSITIVE_KEYS.indexOf(key) >= 0) return { valid: false, error: 'use_save_site_settings' };
  const r = cleanSettingValue(key, value);
  if (!r.ok) return { valid: false, error: r.error };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS_TAB);
  if (!sheet) return { valid: false, error: 'no_settings_tab' };
  writeSettingValue(sheet, sheet.getDataRange().getValues(), key, r.value);
  return { valid: true };
}

/* ---------------- orders ---------------- */

/** Trim, limit length, and stop spreadsheet formulas (=, @, or +/- followed by a non-number). */
function cleanCell(v, max) {
  let s = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (s.length > max) s = s.slice(0, max);
  if (/^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^\+?[\d][\d\s\-()]*$/.test(s))) s = "'" + s;
  return s;
}

function orderNumber(row) { return 'CV-' + (1000 + Number(row)); }

function submitOrder(body) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  const cache = CacheService.getScriptCache();
  const name = cleanCell(body.name, 100);
  const whatsapp = cleanCell(body.whatsapp, 30);
  let email = String(body.email || '').trim().slice(0, 120);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) email = '';
  if (!name || !whatsapp) return { valid: false, error: 'missing_fields' };
  const hourKey = 'orders_hour';
  const count = Number(cache.get(hourKey) || 0);
  if (count >= MAX_ORDERS_PER_HOUR) return { valid: false, error: 'busy' };
  const dupKey = 'dup_' + whatsapp.replace(/\D/g, '') + '_' + String(body.template || '').slice(0, 5);
  if (cache.get(dupKey)) return { valid: true, duplicate: true };
  cache.put(hourKey, String(count + 1), 3600);
  cache.put(dupKey, '1', 600);
  const txn = String(body.txn || '').replace(/[^A-Za-z0-9 _\/.-]/g, '').trim().slice(0, 40);
  let orderNo = '';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const priceShown = priceSnapshot();
    sheet.appendRow([new Date(), name, whatsapp, email, cleanCell(body.template, 20), cleanCell(body.note, 300), 'Pending', '', '', '', txn, priceShown, '']);
    orderNo = orderNumber(sheet.getLastRow());
    audit(orderNo, 'ORDER_CREATED', 'template=' + cleanCell(body.template, 20) + '; txn=' + (txn || 'none') + '; price shown: ' + priceShown + '; email given: ' + (email ? 'yes' : 'no') + '; policy ' + POLICY_VERSION);
  } finally { lock.releaseLock(); }
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'New CV Studio Order ' + orderNo, 'New order ' + orderNo + ' from ' + name + ' - ' + (email || whatsapp) + (txn ? '\nTransaction ID: ' + txn : '\nNo transaction ID given yet.'));
  } catch (e) { Logger.log('owner notification failed: ' + e); }
  if (email) {
    try {
      const ps = paymentSummaryText();
      MailApp.sendEmail({
        to: email,
        subject: 'We received your CV Studio Pro order ' + orderNo,
        body: 'Assalam o Alaikum ' + name + ',\n\nThank you for your order. Your order number is ' + orderNo + '.\n' + ps.price + ps.pay + ps.wa + '\nAfter paying, send the payment screenshot together with your order number (' + orderNo + '). We will confirm your payment and email your unlock code. Confirmation is done manually, so it is not instant.\n\nIf you did not place this order, please ignore this email.\n\nCV Studio Pro',
        name: 'CV Studio Pro'
      });
    } catch (e) { Logger.log('customer confirmation failed: ' + e); }
  }
  return { valid: true, orderNo: orderNo };
}

function getOrders() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  const tz = Session.getScriptTimeZone();
  const data = sheet.getDataRange().getValues();
  const orders = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const ts = data[i][0] instanceof Date ? Utilities.formatDate(data[i][0], tz, "yyyy-MM-dd'T'HH:mm:ss") : String(data[i][0]);
    const up = data[i][8] instanceof Date ? Utilities.formatDate(data[i][8], tz, "yyyy-MM-dd'T'HH:mm:ss") : String(data[i][8] || '');
    const rem = data[i][9] instanceof Date ? Utilities.formatDate(data[i][9], tz, "yyyy-MM-dd'T'HH:mm:ss") : String(data[i][9] || '');
    orders.push({ row: i + 1, timestamp: ts, name: data[i][1], whatsapp: data[i][2], email: data[i][3], template: data[i][4], note: data[i][5], status: data[i][6], code: data[i][7], updated: up, reminded: rem, txn: String(data[i][10] || ''), price: String(data[i][11] || ''), hold: String(data[i][12] || '') === 'HOLD', orderNo: orderNumber(i + 1) });
  }
  return { valid: true, orders: orders, statuses: STATUSES, codesLeft: countFreeCodes() };
}

/**
 * Privacy: erase personal details (name, WhatsApp, email, note) of orders older than N months (default 36).
 * KEEPS the transaction record: order number, date, template, status, code, Transaction ID and the price shown.
 * Orders marked HOLD (a dispute / saved evidence) are never touched. dryRun=true only counts.
 */
function purgeOldOrders(months, dryRun) {
  const m = months === undefined || months === null || months === '' ? RETENTION_MONTHS : Number(months);
  if (!isFinite(m) || m < 12 || m > 60 || Math.floor(m) !== m) return { valid: false, error: 'bad_months' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - m);
  let purged = 0, held = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const ts = data[i][0];
      if (!(ts instanceof Date) || ts.getTime() >= cutoff.getTime()) continue;
      if (String(data[i][1]) === 'Deleted' && !data[i][2] && !data[i][3] && !data[i][5]) continue;
      if (String(data[i][12] || '') === 'HOLD') { held++; continue; }
      purged++;
      if (dryRun) continue;
      sheet.getRange(i + 1, 2, 1, 3).setValues([['Deleted', '', '']]);
      sheet.getRange(i + 1, 6).setValue('');
    }
  } finally {
    lock.releaseLock();
  }
  if (!dryRun && purged) audit('', 'PURGE', purged + ' order(s) older than ' + m + ' months had personal details erased; ' + held + ' on HOLD skipped');
  return { valid: true, purged: purged, held: held, months: m, dryRun: !!dryRun };
}

/* ---------------- price shown, audit log, evidence, hold ---------------- */

function getOrMakeTab(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); }
  return sh;
}

/** Append-only history. Never lets a logging problem break an order. */
function audit(orderNo, event, detail) {
  try { getOrMakeTab(AUDIT_TAB, ['Time', 'Order', 'Event', 'Details']).appendRow([new Date(), String(orderNo || ''), String(event), cleanCell(detail, 500)]); }
  catch (e) { Logger.log('audit failed: ' + e); }
}

/** What price/offer the customer was shown at the moment of the order (read from Settings on the server, not trusted from the browser). */
function priceSnapshot() {
  try {
    const m = readSettingsMap() || {};
    const yes = function (k) { return String(m[k]).toLowerCase() === 'true'; };
    let s = (yes('show_prices') && m.price_premium) ? String(m.price_premium) : '(price not shown)';
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd').slice(0, 10);
    const ends = String(m.offer_ends || '');
    if (yes('offer_enabled') && (!ends || ends >= today)) s += ' | offer on' + (m.price_old ? ' (was ' + m.price_old + ')' : '') + (ends ? ' until ' + ends : '');
    if (yes('free_trial_mode')) s += ' | free trial mode on';
    return cleanCell(s, 200);
  } catch (e) { return ''; }
}

function fmtTs(v, tz) { return v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss") : String(v || ''); }

/** Everything we know about one order, as plain data (for the owner to keep). */
function buildEvidence(rowIndex) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ORDERS_TAB);
  if (!sheet) return null;
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return null;
  const tz = Session.getScriptTimeZone();
  const r = sheet.getRange(rowIndex, 1, 1, 13).getValues()[0];
  const orderNo = orderNumber(rowIndex);
  const events = [];
  const aSheet = ss.getSheetByName(AUDIT_TAB);
  if (aSheet) {
    const rows = aSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][1]) === orderNo) events.push({ time: fmtTs(rows[i][0], tz), event: String(rows[i][2]), details: String(rows[i][3]) });
  }
  let codeInfo = { code: String(r[7] || ''), used: false, usedAt: '' };
  const cSheet = ss.getSheetByName(CODES_TAB);
  if (cSheet && codeInfo.code) {
    const rows = cSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === codeInfo.code.toUpperCase()) {
        const u = rows[i][1];
        codeInfo.used = (u === true || String(u).toUpperCase() === 'TRUE' || String(u).toUpperCase() === 'USED');
        codeInfo.usedAt = fmtTs(rows[i][3], tz);
        break;
      }
    }
  }
  return {
    orderNo: orderNo, savedAt: fmtTs(new Date(), tz), policyVersion: POLICY_VERSION, claimDays: CLAIM_DAYS,
    order: { placedAt: fmtTs(r[0], tz), name: String(r[1]), whatsapp: String(r[2]), email: String(r[3]), template: String(r[4]), note: String(r[5]), status: String(r[6]), updatedAt: fmtTs(r[8], tz), reminderAt: fmtTs(r[9], tz), transactionId: String(r[10] || ''), priceShownAtOrder: String(r[11] || ''), hold: String(r[12] || '') === 'HOLD' },
    code: codeInfo, history: events
  };
}

/** Owner: keep a permanent copy of one order's evidence (Evidence tab) and protect it from the purge (HOLD). */
function saveEvidence(rowIndex) {
  rowIndex = Number(rowIndex);
  const ev = buildEvidence(rowIndex);
  if (!ev) return { valid: false, error: 'bad_row' };
  getOrMakeTab(EVIDENCE_TAB, ['Saved at', 'Order', 'Evidence (JSON)']).appendRow([new Date(), ev.orderNo, JSON.stringify(ev)]);
  SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB).getRange(rowIndex, 13).setValue('HOLD');
  audit(ev.orderNo, 'EVIDENCE_SAVED', 'snapshot saved and order put on HOLD');
  ev.order.hold = true;
  return { valid: true, evidence: ev };
}

/** Owner: protect an order from the purge (or release it). */
function setHold(rowIndex, on) {
  rowIndex = Number(rowIndex);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return { valid: false, error: 'bad_row' };
  sheet.getRange(rowIndex, 13).setValue(on ? 'HOLD' : '');
  audit(orderNumber(rowIndex), on ? 'HOLD_ON' : 'HOLD_OFF', on ? 'kept for a dispute' : 'released');
  return { valid: true, hold: !!on };
}

/* ---------------- monthly report + backup (needs installMonthlyReport() once) ---------------- */

function csvOf(rows) {
  return rows.map(function (r) { return r.map(function (c) { return '"' + String(c instanceof Date ? c.toISOString() : (c === undefined || c === null ? '' : c)).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
}

/** Emails the owner (only) a purge preview and a CSV backup of Orders and AuditLog. Deletes NOTHING. */
function monthlyReport() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const preview = purgeOldOrders(RETENTION_MONTHS, true);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const attach = [];
  [ORDERS_TAB, AUDIT_TAB, EVIDENCE_TAB].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh) attach.push(Utilities.newBlob(csvOf(sh.getDataRange().getValues()), 'text/csv', 'cvstudiopro-' + n + '-' + stamp + '.csv'));
  });
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'CV Studio Pro monthly report ' + stamp,
    body: 'Monthly report (nothing was deleted).\n\nOrders older than ' + RETENTION_MONTHS + ' months whose personal details WOULD be erased if you press the purge button in the admin: ' + (preview.purged || 0) + '\nOrders on HOLD (never erased): ' + (preview.held || 0) + '\n\nAttached: a backup copy of the Orders, AuditLog and Evidence tabs. Keep this email: it is an independent, dated copy of your records. It contains customer details, so do not forward it.',
    attachments: attach,
    name: 'CV Studio Pro'
  });
}

/** Run ONCE from the editor (Run > installMonthlyReport) and accept the permission dialog. */
function installMonthlyReport() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'monthlyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('monthlyReport').timeBased().onMonthDay(1).atHour(9).create();
  Logger.log('Monthly report installed: day 1 of every month, about 9 am.');
}

/** Random, hard-to-guess code such as CVPRO-7KQ2M9XD (uses UUID randomness). */
function randomCode() {
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET.charAt(parseInt(hex.substr(i * 4, 4), 16) % CODE_ALPHABET.length);
  return 'CVPRO-' + out;
}

function countFreeCodes() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const codes = ss.getSheetByName(CODES_TAB), orders = ss.getSheetByName(ORDERS_TAB);
  if (!codes) return 0;
  const claimed = {};
  if (orders) { const od = orders.getDataRange().getValues(); for (let i = 1; i < od.length; i++) if (od[i][7]) claimed[String(od[i][7]).trim()] = true; }
  const cd = codes.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < cd.length; i++) { const c = String(cd[i][0]).trim(); if (c && !cd[i][1] && !claimed[c]) n++; }
  return n;
}

/** Adds n new unique codes to the Codes tab (owner only). */
function generateCodes(count) {
  count = Math.floor(Number(count));
  if (!(count >= 1 && count <= 50)) return { valid: false, error: 'bad_count' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CODES_TAB);
    if (!sheet) return { valid: false, error: 'tab_missing' };
    const existing = {};
    const d = sheet.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) existing[String(d[i][0]).trim().toUpperCase()] = true;
    const made = [];
    while (made.length < count) {
      const c = randomCode();
      if (existing[c]) continue;
      existing[c] = true; made.push(c);
      sheet.appendRow([c, '', 'auto', '']);
    }
    return { valid: true, made: made.length, codesLeft: countFreeCodes() };
  } finally { lock.releaseLock(); }
}

/** Plain-text payment instructions built from the Settings tab (used in customer emails). */
function paymentSummaryText() {
  const map = readSettingsMap() || {};
  let pay = '';
  for (let n = 1; n <= 3; n++) {
    if (map['pay' + n + '_name'] || map['pay' + n + '_number']) {
      pay += '\n- ' + (map['pay' + n + '_name'] || 'Payment') + (map['pay' + n + '_title'] ? ' | ' + map['pay' + n + '_title'] : '') + (map['pay' + n + '_number'] ? ' | ' + map['pay' + n + '_number'] : '');
    }
  }
  const price = (String(map['show_prices']).toLowerCase() === 'true' && map['price_premium']) ? '\nPrice: ' + map['price_premium'] + '\n' : '';
  const wa = String(map['whatsapp'] || '').replace(/\D/g, '');
  return { price: price, pay: pay ? '\nPayment details:' + pay + '\n' : '', wa: wa ? '\nSend your payment screenshot on WhatsApp to +' + wa + '\n' : '' };
}

/** Owner: remind a customer with a Pending order to pay. via='whatsapp' only records that a WhatsApp reminder was sent. */
function sendReminder(rowIndex, via) {
  rowIndex = Number(rowIndex);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return { valid: false, error: 'bad_row' };
  if (String(sheet.getRange(rowIndex, 7).getValue()) !== 'Pending') return { valid: false, error: 'not_pending' };
  const cell = sheet.getRange(rowIndex, 10);
  if (via === 'whatsapp') { cell.setValue(new Date()); audit(orderNumber(rowIndex), 'REMINDER', 'whatsapp (recorded)'); return { valid: true, emailed: false }; }
  const last = cell.getValue();
  if (last instanceof Date && (Date.now() - last.getTime()) < REMINDER_COOLDOWN_HOURS * 3600 * 1000) return { valid: false, error: 'too_soon' };
  const email = String(sheet.getRange(rowIndex, 4).getValue() || '').trim();
  if (!email) return { valid: false, error: 'no_email' };
  const name = String(sheet.getRange(rowIndex, 2).getValue() || '').slice(0, 60);
  const ps = paymentSummaryText();
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Reminder: complete your CV Studio Pro order',
      body: 'Assalam o Alaikum ' + name + ',\n\nWe received your CV Studio Pro order, but we have not yet received the payment.' + ps.price + ps.pay + ps.wa + '\nAfter paying, please send the payment screenshot together with your order number. We will then confirm it and email your unlock code.\n\nIf you have already paid or no longer need the order, please ignore this email.\n\nThank you,\nCV Studio Pro',
      name: 'CV Studio Pro'
    });
  } catch (e) {
    return { valid: true, emailed: false, emailError: String(e && e.message ? e.message : e).slice(0, 160) };
  }
  cell.setValue(new Date());
  audit(orderNumber(rowIndex), 'REMINDER', 'email sent');
  return { valid: true, emailed: true };
}

function approveOrder(rowIndex) {
  rowIndex = Number(rowIndex);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ordersSheet = ss.getSheetByName(ORDERS_TAB);
  const codesSheet = ss.getSheetByName(CODES_TAB);
  if (!ordersSheet || !codesSheet) return { valid: false, error: 'tab_missing' };
  if (!(rowIndex >= 2) || rowIndex > ordersSheet.getLastRow()) return { valid: false, error: 'bad_row' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (String(ordersSheet.getRange(rowIndex, 7).getValue()) !== 'Pending') return { valid: false, error: 'not_pending' };
    const ordersData = ordersSheet.getDataRange().getValues();
    const claimed = {};
    for (let i = 1; i < ordersData.length; i++) { if (ordersData[i][7]) claimed[String(ordersData[i][7]).trim()] = true; }
    const codesData = codesSheet.getDataRange().getValues();
    let assigned = null;
    for (let i = 1; i < codesData.length; i++) {
      const c = String(codesData[i][0]).trim();
      const used = codesData[i][1];
      if (c && !used && !claimed[c]) { assigned = c; break; }
    }
    let autoMade = false;
    if (!assigned) {
      const have = {};
      for (let i = 1; i < codesData.length; i++) have[String(codesData[i][0]).trim().toUpperCase()] = true;
      let c = randomCode();
      while (have[c]) c = randomCode();
      codesSheet.appendRow([c, '', 'auto', '']);
      assigned = c; autoMade = true;
    }
    ordersSheet.getRange(rowIndex, 7).setValue('Approved');
    ordersSheet.getRange(rowIndex, 8).setValue(assigned);
    ordersSheet.getRange(rowIndex, 9).setValue(new Date());
    const email = String(ordersSheet.getRange(rowIndex, 4).getValue() || '');
    const sent = sendCodeEmail(email, assigned);
    audit(orderNumber(rowIndex), 'APPROVED', 'code ' + assigned + (autoMade ? ' (auto-made)' : '') + '; email ' + (sent.emailed ? 'sent' : 'NOT sent: ' + (sent.emailError || 'no email')));
    return { valid: true, code: assigned, emailed: sent.emailed, emailError: sent.emailError, autoGenerated: autoMade };
  } finally {
    lock.releaseLock();
  }
}

function sendCodeEmail(email, code) {
  let emailed = false, emailError = '';
  if (email) {
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Your CV Studio Pro Premium Code',
        body: 'Assalam o Alaikum,\n\nYour premium unlock code is: ' + code + '\n\nOpen the CV builder, choose "Unlock", enter this code and download your CV as PDF or Word. Each code works once only.\n\nIf there is any problem with your order or this code, please contact us within ' + CLAIM_DAYS + ' days of receiving this email, quoting your order number. See our Refund Policy on the website.\n\nThank you,\nCV Studio Pro',
        name: 'CV Studio Pro'
      });
      emailed = true;
    } catch (e) {
      emailError = String(e && e.message ? e.message : e).slice(0, 160);
      Logger.log('code email failed: ' + emailError);
    }
  } else { emailError = 'no_email'; }
  return { emailed: emailed, emailError: emailError };
}

/** Owner: correct a customer's email (typo etc.). */
function updateOrderEmail(rowIndex, email) {
  rowIndex = Number(rowIndex);
  email = String(email || '').trim();
  if (email !== '' && (email.length > 120 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) return { valid: false, error: 'bad_email' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return { valid: false, error: 'bad_row' };
  const cell = sheet.getRange(rowIndex, 4);
  cell.setNumberFormat('@');
  cell.setValue(email);
  return { valid: true, email: email };
}

/** Owner: email the already-assigned code again (uses the current email on the order). */
function resendCode(rowIndex) {
  rowIndex = Number(rowIndex);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return { valid: false, error: 'bad_row' };
  const code = String(sheet.getRange(rowIndex, 8).getValue() || '').trim();
  if (!code) return { valid: false, error: 'no_code' };
  const email = String(sheet.getRange(rowIndex, 4).getValue() || '').trim();
  const sent = sendCodeEmail(email, code);
  audit(orderNumber(rowIndex), 'CODE_RESENT', 'code ' + code + '; email ' + (sent.emailed ? 'sent' : 'NOT sent: ' + (sent.emailError || 'no email')));
  return { valid: true, emailed: sent.emailed, emailError: sent.emailError };
}

function updateStatus(rowIndex, status) {
  rowIndex = Number(rowIndex);
  status = String(status || '');
  if (STATUSES.indexOf(status) < 0) return { valid: false, error: 'bad_status' };
  if (status === 'Approved') return { valid: false, error: 'use_approve' }; // codes are only assigned by approveOrder
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS_TAB);
  if (!sheet) return { valid: false, error: 'no_orders_tab' };
  if (!(rowIndex >= 2) || rowIndex > sheet.getLastRow()) return { valid: false, error: 'bad_row' };
  sheet.getRange(rowIndex, 7).setValue(status);
  sheet.getRange(rowIndex, 9).setValue(new Date());
  audit(orderNumber(rowIndex), 'STATUS', status);
  return { valid: true };
}

/* ---------------- manual tests (no secrets inside) ---------------- */

/** Run this once from the editor: sends a test email to YOU and logs the result or the exact error. */
function testEmail() {
  const me = Session.getEffectiveUser().getEmail();
  try {
    MailApp.sendEmail(me, 'CV Studio test email', 'If you can read this, email sending works. Remaining daily quota: ' + MailApp.getRemainingDailyQuota());
    Logger.log('OK - email sent to ' + me + '. Quota left: ' + MailApp.getRemainingDailyQuota());
  } catch (e) {
    Logger.log('FAILED: ' + e);
  }
}
function testHashSpeed() { const t = Date.now(); makeHash('speed-test-password'); Logger.log('hash took ms: ' + (Date.now() - t)); }
function testSettings() { Logger.log(getSettings()); }
function testOrdersList() { Logger.log(JSON.stringify(getOrders())); }
