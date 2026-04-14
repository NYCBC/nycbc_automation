require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function inspectTargetSheet() {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const authConfig = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    if (credentialsJson) authConfig.credentials = JSON.parse(credentialsJson);
    else if (fs.existsSync('./service-account.json')) authConfig.keyFile = './service-account.json';

    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    const targetSheetId = '1t5D8fLz0qOujWHbLTzWLSZdMMDEjzQiAMXz817evQxM';
    console.log(`Inspecting Target Sheet: ${targetSheetId}`);

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'Registrants!A:I'
        });

        const rows = res.data.values || [];
        console.log(`Total Target Rows Returned: ${rows.length}`);

        let emptyCount = 0;
        for (let i = 0; i < rows.length; i++) {
            if (!rows[i] || rows[i].length === 0 || rows[i].every(c => !c || c.trim() === '')) {
                console.log(`Row ${i + 1} is EMPTY`);
                emptyCount++;
            }
        }

        console.log(`Total Empty Rows inside the range: ${emptyCount}`);

    } catch (e) {
        console.error(e);
    }
}

inspectTargetSheet();
