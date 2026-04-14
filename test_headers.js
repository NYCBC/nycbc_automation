const { google } = require('googleapis');
const SPREADSHEET_ID = '1iW4BmTzViYg99XZXymkgabPb3HfPSwJcIeHYB0NehsU';

async function checkHeaders() {
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        keyFile: './service-account.json'
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'New Application!A1:Z5'
    });
    console.log("Headers:");
    console.log(res.data.values[0]);
    if (res.data.values.length > 1) {
        console.log("First row of data:");
        console.log(res.data.values[1]);
    }
}
checkHeaders();
