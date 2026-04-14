
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

// MOCK the SheetsClient logic from sheets.js to replicate the bug
class DebugClient {
    constructor() {
        this.profileSheetId = '1q6lL7C8Q65FTS2cOhKyegrUqI2GY5XVcI47SLcBtJrc'; // Hardcoded Profile ID

        // Auth
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        const authConfig = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
        if (credentialsJson) {
            authConfig.credentials = JSON.parse(credentialsJson);
        } else if (fs.existsSync('./service-account.json')) {
            authConfig.keyFile = './service-account.json';
        }
        this.auth = new google.auth.GoogleAuth(authConfig);
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }

    _getColIndex(headers, keys) {
        for (const key of keys) {
            // This is the EXACT logic from sheets.js
            const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
            if (idx !== -1) {
                console.log(`  MATCH: Key '${key}' -> Column [${idx}] '${headers[idx]}'`);
                return idx;
            }
        }
        console.log(`  FAIL: Keys [${keys.join(', ')}] -> Not Found`);
        return -1;
    }

    async debugUser(email) {
        console.log(`Reading Profile Sheet: ${this.profileSheetId}`);
        const res = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.profileSheetId,
            range: 'People!A:ZZ', // Wide range
        });

        const rows = res.data.values;
        const headers = rows[0];

        console.log('--- HEADERS DEBUG ---');
        const colMap = {
            firstName: this._getColIndex(headers, ['first name']),
            lastName: this._getColIndex(headers, ['last name']),
            nickname: this._getColIndex(headers, ['nickname', 'nick name']),
            email: this._getColIndex(headers, ['email']),
        };

        console.log('\n--- LOOKING FOR USER ---');
        const target = email.toLowerCase().trim();
        const emailIdx = colMap.email;

        if (emailIdx === -1) {
            console.log('Email column not found!');
            return;
        }

        const userRow = rows.find(r => (r[emailIdx] || '').toLowerCase().trim() === target);

        if (!userRow) {
            console.log(`User ${email} not found.`);
            return;
        }

        console.log(`\n--- DATA FOR ${email} ---`);
        console.log(`Raw Row Length: ${userRow.length}`);

        const getVal = (name, idx) => {
            const val = (idx >= 0 && userRow[idx]) ? userRow[idx] : '[EMPTY]';
            console.log(`${name} (Col ${idx}): ${val}`);
        };

        getVal('First Name', colMap.firstName);
        getVal('Last Name', colMap.lastName);
        getVal('Nickname', colMap.nickname);
        getVal('Email', colMap.email);

        // Dump all columns for visual inspection
        console.log('\n--- FULL ROW DUMP ---');
        userRow.forEach((val, i) => {
            if (val) console.log(`[${i}] ${headers[i]}: ${val}`);
        });
    }
}

const client = new DebugClient();
client.debugUser('wilsonchung35@yahoo.com');
