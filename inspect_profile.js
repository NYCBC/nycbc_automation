const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

// Profile Sheet ID from cloud_run_prd.yaml
const PROFILE_SHEET_ID = '1q6lL7C8Q65FTS2cOhKyegrUqI2GY5XVcI47SLcBtJrc';
const TARGET_EMAIL = 'wilsonchung35@yahoo.com';

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, 'service-account.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    console.log(`Inspecting Profile Sheet: ${PROFILE_SHEET_ID}`);
    console.log(`Searching for: ${TARGET_EMAIL}`);

    try {
        // Read "People!A:ZZ" as per profile.py
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: PROFILE_SHEET_ID,
            range: 'People!A:ZZ',
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return;
        }

        const headers = rows[0].map(h => h.toLowerCase());
        console.log('Headers:', headers);

        const emailIdx = headers.findIndex(h => h.includes('email'));
        const firstIdx = headers.findIndex(h => h.includes('first name'));
        const lastIdx = headers.findIndex(h => h.includes('last name'));
        const nickIdx = headers.findIndex(h => h.includes('nick name') || h.includes('nickname'));

        console.log(`Indexes - Email: ${emailIdx}, First: ${firstIdx}, Last: ${lastIdx}, Nick: ${nickIdx}`);

        const rowIdx = rows.findIndex((r, i) => i > 0 && r[emailIdx] && r[emailIdx].toLowerCase().trim() === TARGET_EMAIL);

        if (rowIdx === -1) {
            console.log('User not found.');
            return;
        }

        const exactRowIdx = rowIdx; // 0-based array index
        const sheetRowNumber = rowIdx + 1; // 1-based Sheet Row

        console.log(`Found User at Row ${sheetRowNumber}`);
        console.log('Current Data:', rows[exactRowIdx]);

        // Fix Data
        // We want First: "Sing Wa", Last: "Chung", Nick: "Wilson 鍾聲華"

        // Prepare update
        // We need to write to specific cells.
        // Convert headers index to Column Letter? simpler to just update the whole row or specific cells based on index.

        // Let's print what we see first before updating, to be safe.
        // Actually, let's just update it if we are confident.

        // Construct array for update
        const firstVal = rows[exactRowIdx][firstIdx];
        const lastVal = rows[exactRowIdx][lastIdx];
        const nickVal = nickIdx > -1 ? rows[exactRowIdx][nickIdx] : 'N/A';

        console.log(`Current: First='${firstVal}', Last='${lastVal}', Nick='${nickVal}'`);

    } catch (err) {
        console.error(err);
    }
}

main();
