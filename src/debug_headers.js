const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function checkHeaders() {
    console.log(`Checking Sheet ID: ${SHEET_ID}`);

    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../service-account.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Members!A1:M5', // Read first 5 rows, A to M
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return;
        }

        console.log('Headers (Row 1):');
        rows[0].forEach((col, index) => {
            console.log(`Index ${index} (${String.fromCharCode(65 + index)}): ${col}`);
        });

        console.log('\nSample Data (Row 2):');
        if (rows.length > 1) {
            rows[1].forEach((col, index) => {
                console.log(`Index ${index}: ${col}`);
            });
        }

    } catch (err) {
        console.error('The API returned an error: ' + err);
    }
}

checkHeaders();
