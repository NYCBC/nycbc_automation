
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function inspectReg() {
    // Auth Setup (Copied from sheets.js basic logic for standalone)
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const authConfig = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    if (credentialsJson) authConfig.credentials = JSON.parse(credentialsJson);
    else if (fs.existsSync('./service-account.json')) authConfig.keyFile = './service-account.json';

    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });
    const regSheetId = process.env.GOOGLE_SHEET_ID;

    console.log(`Inspecting Registration Sheet: ${regSheetId}`);

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: regSheetId,
            range: 'Members!A:M'
        });

        const rows = res.data.values;
        console.log(`Total Rows: ${rows.length}`);

        rows.forEach((row, index) => {
            const rowNum = index + 1;
            // Skip header
            if (rowNum === 1) return;

            const email = (row[4] || '').trim();
            const token = row[12];
            console.log(`\n[ROW #${rowNum}]`);
            console.log(`  First (Col B): ${row[1]}`);
            console.log(`  Last  (Col C): ${row[2]}`);
            console.log(`  Nick  (Col D): ${row[3]}`);
            console.log(`  Email (Col E): ${email}`);
            console.log(`  Token (Col M): ${token}`);
        });

    } catch (e) {
        console.error(e);
    }
}

inspectReg();
