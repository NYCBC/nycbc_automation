const { google } = require('googleapis');
require('dotenv').config();

async function readSheet() {
    const auth = new google.auth.GoogleAuth({
        keyFile: './service-account.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Members!A1:Z5', // Read first 5 rows, columns A to Z
        });

        const rows = response.data.values;
        if (rows.length) {
            console.log('Headers (Row 1):');
            console.log(JSON.stringify(rows[0], null, 2));
            console.log('\nSample Data (Row 2):');
            console.log(JSON.stringify(rows[1], null, 2));
        } else {
            console.log('No data found.');
        }
    } catch (err) {
        console.error('The API returned an error: ' + err);
    }
}

readSheet();
