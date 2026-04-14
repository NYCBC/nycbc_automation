require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function fixSupportSheetGap() {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const authConfig = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    if (credentialsJson) authConfig.credentials = JSON.parse(credentialsJson);
    else if (fs.existsSync('./service-account.json')) authConfig.keyFile = './service-account.json';

    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    const targetSheetId = '1t5D8fLz0qOujWHbLTzWLSZdMMDEjzQiAMXz817evQxM';
    console.log(`Fixing Gap in Support Sheet: ${targetSheetId}`);

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'Registrants!A:I'
        });

        const rows = res.data.values || [];
        console.log(`Total Rows Returned: ${rows.length}`);

        // Find rows to move
        // We know rows 248-260 (0-indexed 247 to 259) have data
        const rowsToMove = rows.slice(247, 260); // 13 rows
        console.log(`Collected ${rowsToMove.length} rows to move.`);

        // Move them to row 158 (0-indexed 157)
        console.log('Writing back to row 158...');
        await sheets.spreadsheets.values.update({
            spreadsheetId: targetSheetId,
            range: `Registrants!A158:I170`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsToMove }
        });
        console.log('Copied rows up to 158-170.');

        // Now clear the old rows (248-260)
        console.log('Clearing old rows 248-260...');
        await sheets.spreadsheets.values.clear({
            spreadsheetId: targetSheetId,
            range: `Registrants!A248:I260`
        });
        console.log('Successfully fixed the gap!');

    } catch (e) {
        console.error(e);
    }
}

fixSupportSheetGap();
