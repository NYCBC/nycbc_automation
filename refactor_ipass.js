const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const getPendingFn = `
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
}

async function runIpassSync(logCallback = console.log) {
`;

code = code.replace("async function runIpassSync(logCallback = console.log) {", getPendingFn);

const syncBodyOld = `        const auth = await getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Read the sheet
        logCallback(\`Reading Google Sheet \${SPREADSHEET_ID}...\`);
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:Z', // We don't know the exact tab name, we can also query the spreadsheet to find the first tab name later if needed. Let's assume A:Z works for the default sheet or change to specific later
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            logCallback(\`No data found in the spreadsheet.\`);
            return { success: true, processed: 0 };
        }

        const headers = rows[0];
        const colMap = getColumnMappings(headers);

        // Ensure required columns exist
        const requiredCols = ['Status', 'IPASS', 'Licence Plate', 'Email', 'First Name', 'Last Name', 'Expiry Date'];
        for (const col of requiredCols) {
            if (colMap[col] === undefined && col !== 'IPASS Updated') {
                // handle alternate names
            }
        }

        // Let's resolve the exact column indices
        const statusIdx = colMap['Status'];
        const ipassUpdatedIdx = colMap['IPASS Updated'];
        const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate']; // typo resilience
        const emailIdx = colMap['Email'];
        const firstNameIdx = colMap['First Name'];
        const lastNameIdx = colMap['Last Name'];
        const expiryDateIdx = colMap['Expiry Date'];

        if (statusIdx === undefined || ipassUpdatedIdx === undefined) {
            throw new Error(\`Could not find required columns in header: Status, IPASS Updated. Found headers: \${headers.join(', ')}\`);
        }

        // 2. Identify rows to process
        const rowsToProcess = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[statusIdx] || '';
            const ipassStatus = row[ipassUpdatedIdx] || '';

            if (status.trim().toLowerCase() === 'approved' && ipassStatus.trim().toLowerCase() !== 'ok') {
                rowsToProcess.push({
                    rowIndex: i + 1, // 1-based, plus header = i+1
                    plate: row[plateIdx] || '',
                    email: row[emailIdx] || '',
                    name: \`\${row[firstNameIdx] || ''} \${row[lastNameIdx] || ''}\`.trim(),
                    expiry: row[expiryDateIdx] || ''
                });
            }
        }`;

const syncBodyNew = `        const auth = await getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const rowsToProcess = await getPendingIpassRecords();`;

code = code.replace(syncBodyOld, syncBodyNew);

// Export the new function
code = code.replace("module.exports = {", "module.exports = {\n    getPendingIpassRecords,");

// Now we replace verbose logCallback calls
// We want to remove all logCallback calls EXCEPT for:
// logCallback(\`Starting IPASS Sync Process...\`);
// logCallback(\`Found \${rowsToProcess.length} approved records needing IPASS update.\`);
// logCallback(\`Plate \${entry.plate}, Name: \${entry.name}, Expiry Date \${formattedExpiry}..\`);
// Error logs, Fatal error logs.

// Silence routine logging
code = code.replace(/logCallback\(`\[IPASS BROWSER CONSOLE\].*?\);\n/g, "");
code = code.replace(/logCallback\(`Navigating to IPASS...`\);\n/g, "");
code = code.replace(/logCallback\(`Switching to Validation tab...`\);\n/g, "");
code = code.replace(/logCallback\(`Logging in...`\);\n/g, "");
code = code.replace(/logCallback\(`Submitting login form...`\);\n/g, "");
code = code.replace(/logCallback\(`Wait over. Checking for mainPageContent...`\);\n/g, "");
code = code.replace(/logCallback\(`Login successful. Current URL.*?\);\n/g, "");
code = code.replace(/logCallback\(`\[DEBUG\] Typed Name: \S+`\);\n/g, "");
code = code.replace(/logCallback\(`\[DEBUG\] Dialog popped up:.*?\);\n/g, "");
code = code.replace(/logCallback\(`\[DEBUG\] Finalizing Cleaned Plate:.*?\);\n/g, "");
code = code.replace(/logCallback\(`   Expiry is next year. Adjusting Start Date...`\);\n/g, "");
code = code.replace(/logCallback\(`   Setting Expiry Date to.*?`\);\n/g, "");
code = code.replace(/logCallback\(`   Issuing validation...`\);\n/g, "");
code = code.replace(/logCallback\(`   Done IPASS. Updating Google Sheet Row .*?`\);\n/g, "");
code = code.replace(/logCallback\(`   Row \S+ complete.`\);\n/g, "");
code = code.replace(/logCallback\(`\[DEBUG\] Timeout waiting for AJAX loader`\);\n/g, "");


// Change the row processing log
const oldLog = "logCallback(`Processing Row ${entry.rowIndex}: Plate ${entry.plate}, Name: ${entry.name}`);";
const newLog = "logCallback(`Plate ${entry.plate}, Name: ${entry.name}, Expiry Date ${entry.expiry}..`);";
code = code.replace(oldLog, newLog);

fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
console.log("Updated ipass.js");
