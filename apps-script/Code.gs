/** @OnlyCurrentDoc */
/**
 * Fitness Coach dashboard: read-only JSON endpoint for the "Fitness Coach Tracker" sheet.
 *
 * Setup (once):
 * 1. Open the Google Sheet → Extensions → Apps Script. Paste this file in as Code.gs.
 * 2. Pick "setup" in the function menu and Run it. It creates a random DASHBOARD_KEY
 *    in Script Properties (only if none exists) and prints it in the Execution log.
 * 3. Deploy → New deployment → type "Web app".
 *      Execute as: Me    Who has access: Anyone
 *    Copy the Web app URL (ends in /exec).
 *
 * Without the right ?key=..., the endpoint returns nothing but an error.
 * It only reads the sheet; it never writes.
 */
const TABS = {
  daily: 'Daily Log',
  profile: 'Profile',
  workout: 'Workout Log',
};

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_KEY');
  const given = (e && e.parameter && e.parameter.key) || '';
  if (!expected || given !== expected) {
    return json_({ error: 'unauthorized' });
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = { fetchedAt: new Date().toISOString() };
  Object.keys(TABS).forEach(function (k) {
    const sh = ss.getSheetByName(TABS[k]);
    out[k] = sh ? trim_(sh.getDataRange().getDisplayValues()) : [];
  });
  return json_(out);
}

// Run once from the editor: creates the secret key if missing and logs it.
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('DASHBOARD_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('DASHBOARD_KEY', key);
  }
  SpreadsheetApp.getActiveSpreadsheet().getName();
  Logger.log('DASHBOARD_KEY=' + key);
}

// Drop trailing rows whose first cell is empty (formula-filled blank rows).
function trim_(values) {
  let end = values.length;
  while (end > 1 && String(values[end - 1][0]).trim() === '') end--;
  return values.slice(0, end);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
