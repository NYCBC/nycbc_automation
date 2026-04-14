const { google } = require('googleapis');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const KEY_PATH = path.join(__dirname, 'service-account.json');
const SPREADSHEET_ID = '1iW4BmTzViYg99XZXymkgabPb3HfPSwJcIeHYB0NehsU';
const RANGE_NAME = 'Sheet1!A:Z';

async function resetTestRow() {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE_NAME,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
        console.log('No data found.');
        return;
    }

    const headers = rows[0];
    const statusIdx = headers.indexOf('Status');
    const ipassIdx = (headers.indexOf('IPASS Updated') !== -1) ? headers.indexOf('IPASS Updated') : headers.indexOf('Update Approved Requests');


    // Find the first row that hasn't been completed or an arbitrary row
    const rowToProcess = 3; // 4th row (index 3), maybe real data or our test row

    // We update Status to 'Approved', IPASS Updated to ''

    const letterStatus = String.fromCharCode(65 + statusIdx);
    const letterIpass = String.fromCharCode(65 + ipassIdx);

    console.log(`Resetting row ${rowToProcess + 1}...`);

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!${letterStatus}${rowToProcess + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['Approved']] }
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!${letterIpass}${rowToProcess + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['']] }
    });

    console.log('Reset complete. Checking if our script can detect it:');

    const { getPendingIpassRecords, runIpassSync } = require('./src/ipass');
    const pending = await getPendingIpassRecords();
    console.log(`Pending records count: ${pending.length}`);

    if (pending.length > 0) {
        console.log('Running Sync...');
        await runIpassSync(console.log);
    }
}

resetTestRow().catch(console.error);
