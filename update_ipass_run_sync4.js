const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

const oldRunSync = `        // Let's resolve the exact column indices
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

const newRunSync = `        // Let's resolve the exact column indices
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

if (code.includes(oldRunSync)) {
    code = code.replace(oldRunSync, newRunSync);
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully replaced runIpassSync extraction block via Exact replacement");
} else {
    console.log("Could not find runIpassSync extraction block.");
}
