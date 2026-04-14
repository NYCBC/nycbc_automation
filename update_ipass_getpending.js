const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const regexGetPending = /async function getPendingIpassRecords\(\) \{[\s\S]*?return rowsToProcess;\n\}/;

const newGetPending = `async function getPendingIpassRecords() {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'A:Z',
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];
    
    const headers = rows[0];
    const colMap = getColumnMappings(headers);
    const statusIdx = colMap['Status'];
    const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate'];
    const emailIdx = colMap['Email'];
    const firstNameIdx = colMap['First Name'];
    const lastNameIdx = colMap['Last Name'];
    const expiryDateIdx = colMap['Expiry Date'];
    
    // Breeze + Email specific columns
    const breezeIdIdx = colMap['Breeze ID'];
    const isActiveIdx = colMap['Is Active'];
    
    // Dynamically find a log column
    const logIdx = colMap['Log'] !== undefined ? colMap['Log'] : (colMap['Email Log'] !== undefined ? colMap['Email Log'] : colMap['IPASS Updated']);

    if (statusIdx === undefined) {
        throw new Error(\`Could not find required column in header: Status\`);
    }

    const rowsToProcess = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[statusIdx] || '';
        
        // Process if Status is exactly 'Approved'
        if (status.trim().toLowerCase() === 'approved') {
            const rawIsActive = row[isActiveIdx] || '';
            const isActiveBool = (rawIsActive === true || rawIsActive === 'TRUE' || rawIsActive === 'Yes' || rawIsActive === 1 || rawIsActive === '1');

            rowsToProcess.push({
                rowIndex: i + 1, // 1-based, plus header = i+1
                plate: row[plateIdx] || '',
                email: row[emailIdx] || '',
                name: \`\${row[firstNameIdx] || ''} \${row[lastNameIdx] || ''}\`.trim(),
                expiry: row[expiryDateIdx] || '',
                breezeId: breezeIdIdx !== undefined ? (row[breezeIdIdx] || '').toString().trim() : '',
                isActive: isActiveBool,
                logIdx: logIdx,
                statusIdx: statusIdx
            });
        }
    }
    return rowsToProcess;
}`;

if (regexGetPending.test(code)) {
    code = code.replace(regexGetPending, newGetPending);
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully replaced getPendingIpassRecords block");
} else {
    console.log("Could not find getPendingIpassRecords block.");
}
