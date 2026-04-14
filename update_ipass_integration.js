const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const oldGetPending = `async function getPendingIpassRecords() {
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
    const ipassUpdatedIdx = colMap['IPASS Updated'];
    const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate'];
    const emailIdx = colMap['Email'];
    const firstNameIdx = colMap['First Name'];
    const lastNameIdx = colMap['Last Name'];
    const expiryDateIdx = colMap['Expiry Date'];

    if (statusIdx === undefined || ipassUpdatedIdx === undefined) {
        throw new Error(\`Could not find required columns in header: Status, IPASS Updated.\`);
    }

    const rowsToProcess = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[statusIdx] || '';
        const ipassStatus = row[ipassUpdatedIdx] || '';
        if (status.trim().toLowerCase() === 'approved' && ipassStatus.trim().toLowerCase() !== 'ok') {
            rowsToProcess.push({
                rowIndex: i + 1,
                plate: row[plateIdx] || '',
                email: row[emailIdx] || '',
                name: \`\${row[firstNameIdx] || ''} \${row[lastNameIdx] || ''}\`.trim(),
                expiry: row[expiryDateIdx] || ''
            });
        }
    }
    return rowsToProcess;
}`;

const newGetPending = `const { updateBreezeAndEmail } = require('./breeze');

async function getPendingIpassRecords() {
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
    const ipassUpdatedIdx = colMap['IPASS Updated'];
    const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate'];
    const emailIdx = colMap['Email'];
    const firstNameIdx = colMap['First Name'];
    const lastNameIdx = colMap['Last Name'];
    const expiryDateIdx = colMap['Expiry Date'];
    
    // Breeze + Email specific columns
    const breezeIdIdx = colMap['Breeze ID'];
    const isActiveIdx = colMap['Is Active'];
    const emailLogIdx = colMap['Email Log'];

    if (statusIdx === undefined || ipassUpdatedIdx === undefined) {
        throw new Error(\`Could not find required columns in header: Status, IPASS Updated.\`);
    }

    const rowsToProcess = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[statusIdx] || '';
        const ipassStatus = row[ipassUpdatedIdx] || '';
        
        // Changed condition: process if NOT 'Completed', because IPASS + Breeze = Completed
        if (status.trim().toLowerCase() === 'approved' && ipassStatus.trim().toLowerCase() !== 'completed') {
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
                emailLogIdx: emailLogIdx,
                ipassUpdatedIdx: ipassUpdatedIdx
            });
        }
    }
    return rowsToProcess;
}`;

let success = false;
if (code.includes(oldGetPending)) {
    code = code.replace(oldGetPending, newGetPending);
    success = true;
} else {
    console.log("oldGetPending block not found.");
}


const oldProcessCount = `        // 5. Process entries
        let processedCount = 0;

        // Debug dumps disabled
        // const dashboardHtml = await page.content();
        // require('fs').writeFileSync('dashboard.html', dashboardHtml);
        // logCallback(\`[DEBUG] Dumped dashboard HTML to dashboard.html for inspection.\`);

        for (const entry of rowsToProcess) {`;

const newProcessCount = `        // 5. Process entries
        let processedCount = 0;

        for (const entry of rowsToProcess) {`;

if (code.includes(oldProcessCount)) {
    code = code.replace(oldProcessCount, newProcessCount);
}


// Replace the end of the loop where it updates Google Sheets
const oldSheetUpdate = `                // 6. Update Google Sheet
                logCallback(\`   Done IPASS. Updating Google Sheet Row \${entry.rowIndex}...\`);

                // Col P = 15 // But we must dynamically use ipassUpdatedIdx
                // A = 0, P = 15. We can convert ipassUpdatedIdx to letters or just use coordinates.
                // We know rowIndex = 1-based. column = ipassUpdatedIdx
                async function updateCell(row, colIndex, value) {
                    // Turn colIndex to Letter (0=A, 1=B, ..., 25=Z, 26=AA)
                    let temp, letter = '';
                    let col = colIndex;
                    while (col >= 0) {
                        temp = col % 26;
                        letter = String.fromCharCode(temp + 65) + letter;
                        col = (col - temp - 26) / 26;
                    }
                    const range = \`\${letter}\${row}\`;

                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: range,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[value]] }
                    });
                }

                await updateCell(entry.rowIndex, ipassUpdatedIdx, 'OK');

                logCallback(\`   Row \${entry.rowIndex} complete.\`);`;

const newSheetUpdate = `                // 6. Breeze API & Email
                logCallback(\`   Done IPASS. Triggering Breeze update and Email for Row \${entry.rowIndex}...\`);
                const breezeResult = await updateBreezeAndEmail(entry, logCallback);

                // 7. Update Google Sheet
                logCallback(\`   Updating Google Sheet Row \${entry.rowIndex}...\`);

                async function updateCell(row, colIndex, value) {
                    if (colIndex === undefined) return;
                    let temp, letter = '';
                    let col = colIndex;
                    while (col >= 0) {
                        temp = col % 26;
                        letter = String.fromCharCode(temp + 65) + letter;
                        col = (col - temp - 26) / 26;
                    }
                    const range = \`\${letter}\${row}\`;

                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: range,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[value]] }
                    });
                }

                // If everything (IPASS + Breeze) went well, we mark Completed
                // If IPASS went well but Breeze failed, we might want to log that it needs manual Breeze update
                if (breezeResult.breezeSuccess) {
                    await updateCell(entry.rowIndex, entry.ipassUpdatedIdx, 'Completed');
                } else {
                    await updateCell(entry.rowIndex, entry.ipassUpdatedIdx, 'IPASS OK, Breeze Failed');
                }

                if (entry.emailLogIdx !== undefined) {
                    const logMsg = breezeResult.breezeSuccess ? (breezeResult.emailSuccess ? '✅ Updated | ✅ Email Sent' : '✅ Updated | ❌ Email Failed') : \`❌ API Error: \${breezeResult.message}\`;
                    await updateCell(entry.rowIndex, entry.emailLogIdx, logMsg);
                }

                logCallback(\`   Row \${entry.rowIndex} fully complete.\`);`;

if (code.includes(oldSheetUpdate)) {
    code = code.replace(oldSheetUpdate, newSheetUpdate);
    success = true;
} else {
    console.log("oldSheetUpdate block not found.");
}

if (success) {
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully updated ipass.js");
}
