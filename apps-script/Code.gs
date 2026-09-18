/**
 * CV Studio Pro — Premium Unlock Verification (Apps Script Web App)
 *
 * Deploy this as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * See apps-script/README.md for full setup instructions.
 */

const SHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE'; // from the Sheet's URL between /d/ and /edit
const CODES_TAB = 'Codes';       // columns: A=code, B=used, C=note, D=date
const OWNER_TAB = 'OwnerLogin';  // column A2 = your owner password

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'verifyCustomer') {
      return respond(verifyCustomerCode(body.code));
    }
    if (action === 'verifyOwner') {
      return respond(verifyOwnerPassword(body.password));
    }
    return respond({ valid: false, error: 'unknown_action' });
  } catch (err) {
    return respond({ valid: false, error: 'server_error' });
  }
}

function verifyCustomerCode(code) {
  if (!code) return { valid: false };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CODES_TAB);
  const data = sheet.getDataRange().getValues(); // [ [code, used, note, date], ... ]
  const normalized = String(code).trim().toUpperCase();

  for (let i = 1; i < data.length; i++) { // row 0 is the header
    const rowCode = String(data[i][0]).trim().toUpperCase();
    if (rowCode === normalized && rowCode !== '') {
      const used = data[i][1];
      if (used === true || String(used).toUpperCase() === 'TRUE') {
        return { valid: false, reason: 'used' };
      }
      sheet.getRange(i + 1, 2).setValue(true);        // mark used
      sheet.getRange(i + 1, 4).setValue(new Date());  // stamp date used
      return { valid: true };
    }
  }
  return { valid: false, reason: 'not_found' };
}

function verifyOwnerPassword(password) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OWNER_TAB);
  const stored = sheet.getRange('A2').getValue();
  if (password && stored && String(password) === String(stored)) {
    return { valid: true };
  }
  return { valid: false };
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
