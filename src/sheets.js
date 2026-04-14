const { google } = require('googleapis');
const fs = require('fs');

class SheetsClient {
    constructor() {
        // Load IDs
        // Primary: Registration Sheet (Read/Write)
        // Hardcoding ID to ensure correct connection during debug of stale data issue
        this.regSheetId = process.env.GOOGLE_SHEET_ID;

        // Auth Setup
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        const authConfig = {
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        };

        if (credentialsJson) {
            try {
                authConfig.credentials = JSON.parse(credentialsJson);
            } catch (e) {
                console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON');
            }
        } else if (fs.existsSync('./service-account.json')) {
            authConfig.keyFile = './service-account.json';
        }

        this.auth = new google.auth.GoogleAuth(authConfig);
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }

    /**
     * Reads all members from the BMM Registration Sheet (Source of Truth for this filter).
     * The Sheet is pre-populated with eligible members.
     */
    async getAllMembers() {
        if (!this.regSheetId) return [];
        console.log(`Reading BMM Member List: ${this.regSheetId}`);

        try {
            // Fetch Members Data (Members!A:Z)
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: 'Members!A:Z',
            });

            const rows = res.data.values;
            if (!rows || rows.length < 2) return []; // Header + 0 rows

            // BMM Sheet Layout (Based on explicit usage in codebase):
            // 0: Breeze ID
            // 1: First Name
            // 2: Last Name
            // 3: Nickname
            // 4: Email
            // 5: Congregation
            // 7: Membership Status
            // 11: Registration Status (Column L, for "Completed")
            // 12: Token (Column M) -- Not used for logic anymore, but read anyway

            const members = rows.slice(1).map((row, index) => {
                const getVal = (idx) => (row[idx] ? row[idx].trim() : '');
                const email = getVal(4);

                return {
                    rowNumber: index + 2, // 1-based index including header
                    breezeId: getVal(0),
                    firstName: getVal(1),
                    lastName: getVal(2),
                    nickname: getVal(3),
                    email: email,
                    congregation: getVal(5),
                    membershipStatus: getVal(7),

                    // Status Check
                    registrationStatus: getVal(11), // Column L
                    token: getVal(12)               // Column M
                };
            }).filter(m => m.email); // Only Process rows with Email

            return members;

        } catch (error) {
            console.error('Error fetching members from BMM Sheet:', error.message);
            return [];
        }
    }

    /**
     * Saves a token to the REGISTRATION SHEET.
     * If member exists, updates token. If not, creates new row.
     */
    async saveToken(email, token, profileData) {
        if (!this.regSheetId || !email) return false;

        try {
            // 1. Check if row exists in Reg Sheet
            // Search locally first to avoid N API calls? No, findRowByEmail does one call usually?
            // Actually findRowByEmail reads E:E. Safe to call.
            const rowNumber = await this.findRowByEmail(email);

            if (rowNumber) {
                // Update existing: Refresh Member Details (A:F) and Token (M)
                // We keep existing Registration defaults (Cols I-L) to preserve user state if any.

                // 1. Update Profile Info (A:F)
                const profileValues = [[
                    profileData.breezeId || '',
                    profileData.firstName || '',
                    profileData.lastName || '',
                    profileData.nickname || '',
                    email,
                    profileData.congregation || ''
                ]];

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.regSheetId,
                    range: `Members!A${rowNumber}:F${rowNumber}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: profileValues }
                });

                // 2. Update Token (M)
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.regSheetId,
                    range: `Members!M${rowNumber}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[token]] }
                });

            } else {
                // Create New Row
                // Map Profile Data to Reg Sheet Columns (BreezeID, First, Last, Nick, Email, Cong, MemID, Status, Interp, Proxy, ProxyName, Reg, Token)
                const newRow = [
                    profileData.breezeId || '',
                    profileData.firstName || '',
                    profileData.lastName || '',
                    profileData.nickname || '',
                    email,
                    profileData.congregation || '',
                    '', // Member ID (skip)
                    profileData.membershipStatus || '',
                    'None', // Default Interp
                    'No',   // Default Proxy
                    '',     // Proxy Name
                    '',     // Registration Status
                    token   // Token
                ];

                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.regSheetId,
                    range: 'Members!A:M',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    resource: { values: [newRow] }
                });
            }
            return true;
        } catch (error) {
            console.error(`Error saving token for ${email}:`, error.message);
            return false;
        }
    }

    /**
     * Finds row in REGISTRATION SHEET by Email.
     * Returns 1-based Row Index.
     */
    async findRowByEmail(email) {
        if (!this.regSheetId) return null;
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: 'Members!E:E' // Email is Col E
            });
            const rows = res.data.values;
            if (!rows) return null;

            const target = email.toLowerCase().trim();
            for (let i = 0; i < rows.length; i++) {
                if (rows[i][0] && rows[i][0].toLowerCase().trim() === target) {
                    return i + 1;
                }
            }
            return null;
        } catch (error) {
            console.error('Error finding row:', error.message);
            return null;
        }
    }

    /**
     * Updates Registration details in REGISTRATION SHEET.
     */
    async updateRegistration(rowNumber, data) {
        if (!this.regSheetId) return;
        try {
            // Prevent wiping data: Read existing row first
            let currentVals = { translation: '', proxy: '', proxyName: '', joinUrl: '' };
            try {
                const readRes = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.regSheetId,
                    range: `Members!I${rowNumber}:L${rowNumber}`
                });
                const rows = readRes.data.values;
                if (rows && rows.length > 0) {
                    const r = rows[0];
                    currentVals.translation = r[0] || '';
                    currentVals.proxy = r[1] || '';
                    currentVals.proxyName = r[2] || '';
                    currentVals.joinUrl = r[3] || '';
                }
            } catch (readErr) {
                console.warn(`Warning: Failed to read row ${rowNumber} for safety:`, readErr.message);
            }

            // Merge Logic: Use incoming data if present, else fallback to existing
            // Note: Use explicit undefined check if possible, or just truthy checks if defaults are acceptable
            // data.translation might be empty string if intentionally cleared? 
            // Usually we assume if key is missing in data, keep existing.

            const val = (key, fallback) => (data[key] !== undefined ? data[key] : fallback);

            // Default 'None'/'No' only if BOTH are empty
            const translation = val('translation', currentVals.translation) || 'None';
            const proxy = val('proxy', currentVals.proxy) || 'No';
            const proxyName = val('proxyName', currentVals.proxyName);
            const joinUrl = val('joinUrl', currentVals.joinUrl) || 'Registered';

            const values = [
                translation,
                proxy,
                proxyName,
                joinUrl
            ];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.regSheetId,
                range: `Members!I${rowNumber}:L${rowNumber}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [values] }
            });
            return true;
        } catch (error) {
            console.error('Error updating registration:', error.message);
            return false;
        }
    }

    /**
     * Findings Member by Token in REGISTRATION SHEET.
     */
    async findMemberByToken(token) {
        if (!this.regSheetId || !token) return null;
        try {
            // Read whole sheet (Members!A:M)
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: 'Members!A:M'
            });
            const rows = res.data.values;
            if (!rows) return null;

            // Header: Breeze(0), First(1), Last(2), Nick(3), Email(4)... Token(12)
            const row = rows.find(r => r[12] === token);
            if (!row) return null;

            return {
                firstName: row[1],
                firstNameOnly: row[1], // Explicit Raw First Name
                lastName: row[2],
                nickname: row[3],
                email: row[4],
                congregation: row[5],
                membershipStatus: row[7],
                token: row[12]
            };
        } catch (error) {
            console.error('Error finding member by token:', error.message);
            return null;
        }
    }

    async debugRegistrationRow(rowNum) {
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: `Members!A${rowNum}:M${rowNum}`
            });
            return res.data.values ? res.data.values[0] : null;
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * Updates ONLY Column M (Token/Status) for a given email.
     * Used to mark "Invitation Email Sent".
     */
    async updateTokenColumn(email, statusValue) {
        if (!this.regSheetId || !email) return false;
        try {
            const rowNumber = await this.findRowByEmail(email);
            if (!rowNumber) {
                console.error(`Could not find row for ${email} to update status.`);
                return false;
            }

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.regSheetId,
                range: `Members!M${rowNumber}`, // Col M
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[statusValue]] }
            });
            return true;
        } catch (error) {
            console.error(`Error updating token/status column for ${email}:`, error.message);
            return false;
        }
    }

    /**
     * Updates ONLY Column M (Token/Status) for a given Breeze ID (Col A).
     */
    async updateTokenColumnByBreezeId(breezeId, statusValue) {
        if (!this.regSheetId || !breezeId) return false;
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: 'Members!A:A' // Breeze ID is Col A
            });
            const rows = res.data.values;
            if (!rows) return false;

            let rowNumber = -1;
            const target = breezeId.toString().trim();
            for (let i = 0; i < rows.length; i++) {
                if (rows[i][0] && rows[i][0].toString().trim() === target) {
                    rowNumber = i + 1;
                    break;
                }
            }

            if (rowNumber === -1) {
                console.error(`Could not find row for Breeze ID ${breezeId} to update status.`);
                return false;
            }

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.regSheetId,
                range: `Members!M${rowNumber}`, // Col M
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[statusValue]] }
            });
            return true;
        } catch (error) {
            console.error(`Error updating status for Breeze ID ${breezeId}:`, error.message);
            return false;
        }
    }

    /**
     * Reads the "Parameters" tab to fetch Key-Value configuration.
     * Expected format: Col A = Key, Col B = Value
     * Returns an Object: { "Key": "Value" }
     */
    async getParameters() {
        if (!this.regSheetId) return {};
        console.log(`Reading Parameters from BMM Sheet...`);

        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: 'Parameters!A:B',
            });

            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                console.warn("Warning: 'Parameters' tab is empty or missing.");
                return {};
            }

            const params = {};
            // Skip Header (Row 1) if it exists? Usually Row 1 is Key/Value headers.
            // Let's iterate all rows. If Key matches specific names, use it.
            // Safe to start from index 1 to skip header "Field Name", "Value"
            for (let i = 1; i < rows.length; i++) {
                const key = rows[i][0] ? rows[i][0].trim() : null;
                const value = rows[i][1] ? rows[i][1].trim() : '';
                if (key) {
                    params[key] = value;
                }
            }

            console.log("Parameters Loaded:", params);
            return params;

        } catch (error) {
            console.error('Error fetching Parameters:', error.message);
            return {};
        }
    }
    /**
     * Copies a row from the Main Sheet to usage "Support Sheet".
     * Validates that the target sheet ID exists in Parameters.
     */
    async copyRowToSupportSheet(rowNumber, targetSheetId) {
        if (!this.regSheetId || !targetSheetId || !rowNumber) return false;

        console.log(`Syncing Row ${rowNumber} to Support Sheet ${targetSheetId}...`);

        try {
            // 1. Read Source Row (A:L)
            // A: BreezeID, B: First, C: Last, D: Nick, E: Email, F: Cong
            // I: Translation, J: Proxy, K: ProxyName
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.regSheetId,
                range: `Members!A${rowNumber}:L${rowNumber}`
            });

            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                console.error(`Source row ${rowNumber} not found.`);
                return false;
            }

            const src = rows[0];
            const getVal = (idx) => (src[idx] ? src[idx].trim() : '');

            // 2. Map to Target Columns
            // A: Member ID (Source A)
            // B: Nickname (Source D) -> Fallback First Name (Source B)
            // C: Last Name (Source C)
            // D: Email (Source E)
            // E: Congregation (Source F)
            // F: Interpretation (Source I -> Index 8 (A=0, I=8))
            // G: Proxy (Source J -> Index 9)
            // H: Proxy Name (Source K -> Index 10)

            const nickname = getVal(3);
            const firstName = getVal(1);
            const membershipStatus = getVal(7).toLowerCase();

            let displayName = nickname || firstName;
            if (membershipStatus !== 'active') {
                displayName = `(N) ${displayName}`;
            }

            const targetRow = [
                getVal(7),  // Membership Status (Source Col H)
                displayName, // Nick/First
                getVal(2),  // Last
                getVal(4),  // Email
                getVal(5),  // Cong
                getVal(8),  // Interpretation (Col F) - Source Col I (Index 8)
                getVal(9),  // Proxy (Col G) - Source Col J (Index 9)
                getVal(10), // Proxy Name (Col H) - Source Col K (Index 10)
                getVal(0)   // Breeze ID (Col I) - Source Col A (Index 0)
            ];

            // 3. Find Next Empty Row OR Existing Row (Check Col D=Email, Col I=BreezeID)
            const targetRes = await this.sheets.spreadsheets.values.get({
                spreadsheetId: targetSheetId,
                range: 'Registrants!A:I'
            });
            const targetRows = targetRes.data.values || [];

            let writeRow = targetRows.length + 1; // Default Append
            const breezeIdTarget = getVal(0);
            const emailTarget = getVal(4);
            const emailTargetLower = emailTarget ? emailTarget.toLowerCase() : '';

            let found = false;

            // 1. Check Breeze ID (Col I -> Index 8)
            if (breezeIdTarget) {
                const existingIdx = targetRows.findIndex(r => r[8] && r[8].toString().trim() === breezeIdTarget);
                if (existingIdx !== -1) {
                    writeRow = existingIdx + 1; // 1-based
                    found = true;
                }
            }

            // 2. Check Email (Col D -> Index 3)
            if (!found && emailTargetLower) {
                const existingIdx = targetRows.findIndex(r => r[3] && r[3].toString().trim().toLowerCase() === emailTargetLower);
                if (existingIdx !== -1) {
                    writeRow = existingIdx + 1;
                    found = true;
                }
            }

            // 3. FIND First Empty Row to prevent Google Sheets 'append' from jumping past empty formatted rows
            if (!found) {
                let firstEmptyRow = -1;
                for (let i = 0; i < targetRows.length; i++) {
                    const r = targetRows[i];
                    // If row is missing both Nick/First Name (Col B) AND Email (Col D), we treat it as empty
                    if (!r || r.length === 0 || (!r[1] && !r[3])) {
                        firstEmptyRow = i + 1; // 1-based index
                        break;
                    }
                }

                if (firstEmptyRow !== -1) {
                    writeRow = firstEmptyRow;
                }
                // We ALWAYS use update now since we know the exact row to write to.
                found = true;
            }

            // 4. Update (Since found is always true now, we always update)
            if (found) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: targetSheetId,
                    range: `Registrants!A${writeRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [targetRow] }
                });
                console.log(`Updated or inserted row ${writeRow} in Support Sheet.`);
            } else {
                // Keep append as a strict fallback (will never run due to logic above, but safe)
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: targetSheetId,
                    range: 'Registrants!A:I',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    resource: { values: [targetRow] }
                });
                console.log(`Appended new row to Support Sheet.`);
            }

            console.log(`Successfully synced row ${rowNumber} to Support Sheet.`);
            return true;

        } catch (error) {
            console.error(`Error syncing row to support sheet:`, error.message);
            return false;
        }
    }
}

module.exports = new SheetsClient();
