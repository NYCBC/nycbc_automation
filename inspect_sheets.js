
const { google } = require('googleapis');
require('dotenv').config();
const fs = require('fs');

async function checkSheets() {
    // Auth
    let authConfig = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        authConfig.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync('./service-account.json')) {
        authConfig.keyFile = './service-account.json';
    }
    const auth = new google.auth.GoogleAuth(authConfig);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Check Registration Sheet (Current Config)
    const regSheetId = process.env.GOOGLE_SHEET_ID; // "1eNQq..."
    console.log(`\n--- Inspecting Registration Sheet: ${regSheetId} ---`);
    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: regSheetId });
        const title = meta.data.properties.title;
        console.log(`Title: ${title}`);

        // Check sheets/tabs
        const tabs = meta.data.sheets.map(s => s.properties.title);
        console.log(`Tabs: ${tabs.join(', ')}`);

        // Check Headers of first tab
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: regSheetId,
            range: `${tabs[0]}!A1:Z1`
        });
        console.log('Headers:', res.data.values ? res.data.values[0] : 'EMPTY');
    } catch (e) {
        console.error('Error reading Registration Sheet:', e.message);
    }

    // 2. Check Profile Sheet (Hardcoded ID from nycbc_connect investigation)
    // ID: 1q6lL7C8Q65FTS2cOhKyegrUqI2GY5XVcI47SLcBtJrc
    const profileId = '1q6lL7C8Q65FTS2cOhKyegrUqI2GY5XVcI47SLcBtJrc';
    console.log(`\n--- Inspecting Profile Sheet: ${profileId} ---`);
    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: profileId });
        console.log(`Title: ${meta.data.properties.title}`);

        // The previous investigation said tab is "People"
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: profileId,
            range: 'People!A1:ZZ1'
        });
        const headers = res.data.values ? res.data.values[0] : [];
        console.log(`Found ${headers.length} headers.`);

        // Find indices
        const getIdx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        console.log('Email Index:', getIdx('Email'));
        console.log('License Index:', getIdx('License Plate'));
        console.log('First Name Index:', getIdx('First Name'));
    } catch (e) {
        console.error('Error reading Profile Sheet:', e.message);
    }
}

checkSheets();
