const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const regexRunSync = /\/\/ Let's resolve the exact column indices[\s\S]*?rowsToProcess\.push\(\{[\s\S]*?expiry: row\[expiryDateIdx\] \|\| ''\n\s*\}\);\n\s*\}\n\s*\}/;

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
            throw new Error(\`Could not find required column in header: Status. Found headers: \${headers.join(', ')}\`);
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
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully replaced runIpassSync extraction block via regex");
} else {
    console.log("Could not find runIpassSync extraction block.");
}
