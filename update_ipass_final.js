const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

// 1. Replace the extraction part
const regexRunSync = /\/\/ Let's resolve the exact column indices[\s\S]*?\/\/ 2\. Identify rows to process[\s\S]*?rowsToProcess\.push\(\{[\s\S]*?\}\);\s*\}\s*\}/;

const newRunSync = `// Let's resolve the exact column indices
        const statusIdx = colMap['Status'];
        const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate']; // typo resilience
        const emailIdx = colMap['Email'];
        const firstNameIdx = colMap['First Name'];
        const lastNameIdx = colMap['Last Name'];
        const expiryDateIdx = colMap['Expiry Date'];
        const breezeIdIdx = colMap['Breeze ID'];
        const isActiveIdx = colMap['Is Active'];
        
        // Dynamically find a log column
        const logIdx = colMap['Log'] !== undefined ? colMap['Log'] : (colMap['Email Log'] !== undefined ? colMap['Email Log'] : colMap['IPASS Updated']);

        if (statusIdx === undefined) {
            throw new Error(\`Could not find required columns in header: Status. Found headers: \${headers.join(', ')}\`);
        }

        // 2. Identify rows to process
        const rowsToProcess = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[statusIdx] || '';

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
        }`;

if (regexRunSync.test(code)) {
    code = code.replace(regexRunSync, newRunSync);
    console.log("Extraction block replaced.");
} else {
    console.log("Extraction block NOT found.");
}


// 2. Replace the Sheet Update part
const regexSheetUpdate = /\/\/ If everything \(IPASS \+ Breeze\) went well, we mark Completed[\s\S]*?logCallback\(`   Row \$\{entry\.rowIndex\} fully complete\.`\);/;

const newSheetUpdate = `// If everything (IPASS + Breeze) went well, we mark Completed
                if (breezeResult.breezeSuccess) {
                    await updateCell(entry.rowIndex, entry.statusIdx, 'Completed');
                    const logMsg = breezeResult.emailSuccess ? '✅ Breeze Updated | ✅ IPass Updated' : '✅ Breeze Updated | ✅ IPass Updated (Email Failed)';
                    await updateCell(entry.rowIndex, entry.logIdx, logMsg);
                } else {
                    await updateCell(entry.rowIndex, entry.logIdx, \`❌ Breeze Failed: \${breezeResult.message}\`);
                    // Status remains 'Approved' so it can be retried
                }

                logCallback(\`   Row \${entry.rowIndex} fully complete.\`);`;

if (regexSheetUpdate.test(code)) {
    code = code.replace(regexSheetUpdate, newSheetUpdate);
    console.log("Sheet Update block replaced.");
} else {
    console.log("Sheet Update block NOT found.");
}

// 3. Catch block IPASS Error logging
const regexCatchBlock = /\} catch \(err\) \{[\s\S]*?logCallback\(`   \[!\] Error processing row \$\{entry\.rowIndex\}: \$\{err\.message\}`\);\s*\}/;
const newCatchBlock = `} catch (err) {
                logCallback(\`   [!] Error processing row \${entry.rowIndex}: \${err.message}\`);
                
                // Keep Status as 'Approved', but write the error to the Log column
                try {
                    async function updateCellFallback(row, colIndex, value) {
                        if (colIndex === undefined) return;
                        let temp, letter = '';
                        let col = colIndex;
                        while (col >= 0) {
                            temp = col % 26;
                            letter = String.fromCharCode(temp + 65) + letter;
                            col = (col - temp - 26) / 26;
                        }
                        const range = \`\${letter}\${row}\`;
                        const sheets = google.sheets({ version: 'v4', auth: await getAuthClient() });
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: range,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [[value]] }
                        });
                    }
                    await updateCellFallback(entry.rowIndex, entry.logIdx, \`❌ IPASS Error: \${err.message}\`);
                } catch (writeErr) {
                    logCallback(\`   [!] Also failed to write error to Google Sheet: \${writeErr.message}\`);
                }
            }`;

if (regexCatchBlock.test(code)) {
    code = code.replace(regexCatchBlock, newCatchBlock);
    console.log("Catch block replaced.");
} else {
    console.log("Catch block NOT found.");
}

fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
console.log("File saved.");
