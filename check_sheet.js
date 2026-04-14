const { google } = require('googleapis');
const fs = require('fs');

async function checkSheet() {
    const authConfig = {
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        keyFile: './service-account.json'
    };
    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    // Check old sheet first
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: '1fj2dLBJX_5lzZUEoNl2PeH5B79YlxzNmIYd027uS_A4',
            range: 'Members!A1:Z5'
        });
        console.log("NEW SHEET DATA:");
        console.log(JSON.stringify(res.data.values, null, 2));
    } catch (e) {
        console.log("Error reading new sheet:", e.message);
    }
}
checkSheet();
