# CV Studio Pro — Premium Unlock Backend Setup

This replaces the old hardcoded `ACCESS_CODE` / `ownerKey` that lived in the
public frontend. Codes are now unique per order, checked on a server, and
single-use. Nothing secret lives in the GitHub repo anymore.

## 1. Create the Google Sheet

1. Go to https://sheets.google.com and create a new blank Sheet.
2. Rename it, e.g. "CV Studio Pro — Access Codes".
3. Create two tabs (bottom of the screen):
   - **Codes** — row 1 headers: `code | used | note | date`
   - **OwnerLogin** — cell **A1**: `password`, cell **A2**: your chosen owner password (pick something only you know — this replaces the old `cvspro-9f21` key)
4. Copy the Sheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

## 2. Create the Apps Script project

1. In the Sheet, click **Extensions → Apps Script**.
2. Delete any starter code, and paste the contents of `apps-script/Code.gs` (in this repo) into the editor.
3. Replace `PASTE_YOUR_GOOGLE_SHEET_ID_HERE` with the Sheet ID from step 1.
4. Click **Save** (disk icon), name the project e.g. "CV Studio Pro Verify".

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**. Google will ask you to authorize the script — approve it (it's your own script, this is expected).
5. Copy the **Web app URL** it gives you (ends in `/exec`).

## 4. Connect it to the site

1. Open `js/app.js` in this repo.
2. Find this line near the top:
   ```js
   const VERIFY_API_URL='PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
   ```
3. Replace the placeholder with the URL you copied in step 3.5.
4. Commit and push. GitHub Pages will redeploy in a minute or two.

## 5. Daily use — adding a code for a new order

1. Customer pays and confirms on WhatsApp.
2. Open the Sheet's **Codes** tab, add a new row: put a unique code in column A (e.g. `CVPRO-4F82K`), leave "used" blank.
3. Send that exact code to the customer on WhatsApp.
4. They type it into the "Already paid? Enter your access code" box on the site — it unlocks once, then stops working for anyone else.

## 6. Owner login (replaces the old `?ownerKey=` link)

Go to `admin.html`, enter the password you set in the **OwnerLogin** tab (step 1.3). This is checked against the Sheet, not stored anywhere in the code. It stays logged in for that browser tab until you click Log Out or close the tab.

## Notes

- If you ever need to change the owner password, just edit cell **OwnerLogin!A2** in the Sheet — no code changes needed.
- If you want to deactivate a code before it's used, delete its row in the Sheet or type "USED" manually in column B.
- Free forever at this scale — Apps Script's free daily limit (20,000 requests/day) is far above what a WhatsApp-order business will use.
