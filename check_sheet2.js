const { google } = require('googleapis');

async function checkSheet() {
    const authConfig = {
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        keyFile: './service-account.json'
    };
    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    // Check old sheet
    try {
        const resOld = await sheets.spreadsheets.values.get({
            spreadsheetId: '1eNQq5OsY4w8N8wyn69GJ7E45K9WmfdKbzP39wMGAMSI',
            range: 'Parameters!A1:B5'
        });
        console.log("OLD SHEET PARAMETERS:");
        console.log(resOld.data.values);
    } catch (e) { }

    // Check new sheet
    try {
        const resNew = await sheets.spreadsheets.values.get({
            spreadsheetId: '1fj2dLBJX_5lzZUEoNl2PeH5B79YlxzNmIYd027uS_A4',
            range: 'Parameters!A1:B5'
        });
        console.log("NEW SHEET PARAMETERS:");
        console.log(resNew.data.values);
    } catch (e) { }
}
checkSheet();
