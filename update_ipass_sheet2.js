const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const regexSheetUpdate = /\/\/ 6\. Update Google Sheet[\s\S]*?logCallback\(`   Row \$\{entry\.rowIndex\} complete\.`\);/g;

const newSheetUpdate = `// 6. Breeze API & Email
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

if (regexSheetUpdate.test(code)) {
    code = code.replace(regexSheetUpdate, newSheetUpdate);
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully replaced Sheet Update block via regex");
} else {
    console.log("Could not find the exact oldSheetUpdate block.");
}
