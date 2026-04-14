const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { google } = require('googleapis');
const path = require('path');

// Google Sheets auth
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const KEY_PATH = path.join(__dirname, '../service-account.json');

const SPREADSHEET_ID = process.env.IPASS_SHEET_ID || '1iW4BmTzViYg99XZXymkgabPb3HfPSwJcIeHYB0NehsU';
const RANGE_TO_READ = 'New Application!A:Z';

let authClient = null;

async function getAuthClient() {
    if (!authClient) {
        const authConfig = { scopes: SCOPES };
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

        if (credentialsJson) {
            try {
                authConfig.credentials = JSON.parse(credentialsJson);
            } catch (e) {
                console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON in ipass.js');
            }
        } else if (require('fs').existsSync(KEY_PATH)) {
            authConfig.keyFile = KEY_PATH;
        }

        const auth = new google.auth.GoogleAuth(authConfig);
        authClient = await auth.getClient();
    }
    return authClient;
}

// Map column headers to index
function getColumnMappings(headers) {
    const mappings = {};
    headers.forEach((header, index) => {
        mappings[header.trim()] = index;
    });
    return mappings;
}


const { updateBreezeAndEmail } = require('./breeze');

async function getPendingIpassRecords() {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE_TO_READ,
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
    const isActiveIdx = colMap['Is Active'] !== undefined ? colMap['Is Active'] : colMap['Active'];

    // Dynamically find a log column
    const logIdx = colMap['Log'] !== undefined ? colMap['Log'] : (colMap['Email Log'] !== undefined ? colMap['Email Log'] : (colMap['IPASS Updated'] !== undefined ? colMap['IPASS Updated'] : colMap['Update Approved Requests']));

    if (statusIdx === undefined) {
        throw new Error(`Could not find required column in header: Status`);
    }

    const rowsToProcess = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[statusIdx] || '';

        // Process if Status is 'Approved' OR 'Rejected'
        const statusLower = status.trim().toLowerCase();
        if (statusLower === 'approved' || statusLower === 'rejected') {
            const rawIsActive = row[isActiveIdx] || '';
            const isActiveBool = (rawIsActive === true || rawIsActive === 'TRUE' || rawIsActive === 'Yes' || rawIsActive === 1 || rawIsActive === '1');

            rowsToProcess.push({
                rowIndex: i + 1, // 1-based, plus header = i+1
                plate: row[plateIdx] || '',
                email: row[emailIdx] || '',
                name: `${row[firstNameIdx] || ''} ${row[lastNameIdx] || ''}`.trim(),
                expiry: row[expiryDateIdx] || '',
                breezeId: breezeIdIdx !== undefined ? (row[breezeIdIdx] || '').toString().trim() : '',
                isActive: isActiveBool,
                logIdx: logIdx,
                statusIdx: statusIdx,
                statusOriginal: statusLower,
                rawData: row // Store full row for moving to History tab
            });
        }
    }
    
    // Sort bottom-up (descending rowIndex) to safely delete rows later without shifting indices
    return rowsToProcess.sort((a, b) => b.rowIndex - a.rowIndex);
}

async function runIpassSync(logCallback = console.log) {

    let browser = null;
    try {
        logCallback(`Starting IPASS Sync Process...`);

        const auth = await getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Read the sheet
        logCallback(`Reading Google Sheet ${SPREADSHEET_ID}...`);
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE_TO_READ, 
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            logCallback(`No data found in the spreadsheet.`);
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
        const plateIdx = colMap['Licence Plate'] !== undefined ? colMap['Licence Plate'] : colMap['License Plate']; // typo resilience
        const emailIdx = colMap['Email'];
        const firstNameIdx = colMap['First Name'];
        const lastNameIdx = colMap['Last Name'];
        const expiryDateIdx = colMap['Expiry Date'];
        const breezeIdIdx = colMap['Breeze ID'];
        const isActiveIdx = colMap['Is Active'] !== undefined ? colMap['Is Active'] : colMap['Active'];

        // Dynamically find a log column
        const logIdx = colMap['Log'] !== undefined ? colMap['Log'] : (colMap['Email Log'] !== undefined ? colMap['Email Log'] : (colMap['IPASS Updated'] !== undefined ? colMap['IPASS Updated'] : colMap['Update Approved Requests']));

        if (statusIdx === undefined) {
            throw new Error(`Could not find required columns in header: Status. Found headers: ${headers.join(', ')}`);
        }

        // 2. Identify rows to process
        const rowsToProcess = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[statusIdx] || '';

            const statusLower = status.trim().toLowerCase();
            if (statusLower === 'approved' || statusLower === 'rejected') {
                const rawIsActive = row[isActiveIdx] || '';
                const isActiveBool = (rawIsActive === true || rawIsActive === 'TRUE' || rawIsActive === 'Yes' || rawIsActive === 1 || rawIsActive === '1');

                rowsToProcess.push({
                    rowIndex: i + 1, // 1-based, plus header = i+1
                    plate: row[plateIdx] || '',
                    email: row[emailIdx] || '',
                    name: `${row[firstNameIdx] || ''} ${row[lastNameIdx] || ''}`.trim(),
                    expiry: row[expiryDateIdx] || '',
                    breezeId: breezeIdIdx !== undefined ? (row[breezeIdIdx] || '').toString().trim() : '',
                    isActive: isActiveBool,
                    logIdx: logIdx,
                    statusIdx: statusIdx,
                    statusOriginal: statusLower,
                    rawData: row // Store full row for moving to History tab
                });
            }
        }
        
        // Sort bottom-up (descending rowIndex) so deletion of rows at the end of the script doesn't offset subsequent rows
        rowsToProcess.sort((a, b) => b.rowIndex - a.rowIndex);

        logCallback(`Found ${rowsToProcess.length} approved/rejected records needing processing.`);

        if (rowsToProcess.length === 0) {
            return { success: true, processed: 0 };
        }

        // 3. Launch Puppeteer
        logCallback(`Launching headless browser...`);
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            headless: true
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Spoof a real user agent to prevent WAFs from blocking headless chrome
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Capture browser console logs for deep debugging
        page.on('console', msg => {
            logCallback(`[IPASS BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        // Disable request interception as it might be causing silent freezing on some network environments
        // await page.setRequestInterception(true);
        // page.on('request', (req) => {
        //     if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
        //         req.abort().catch(() => {});
        //     } else {
        //         req.continue().catch(() => {});
        //     }
        // });

        // 4. Login to IPASS
        logCallback(`Navigating to IPASS...`);
        // Do not await goto, as IPASS servers sometimes hang open connections indefinitely
        page.goto('https://ipass.preciserd.com/v2/', { timeout: 60000 }).catch(e => {
            logCallback(`[DEBUG] page.goto warning: ${e.message}`);
        });

        logCallback(`Switching to Validation tab...`);
        // The page uses Javascript setTimeout to default switch to Client tab on load. 
        // We must wait for it to settle and then explicitly click the Validation tab.
        try {
            await page.waitForSelector('#validation-form-link', { visible: true, timeout: 60000 });
            await new Promise(r => setTimeout(r, 1000));
            await page.click('#validation-form-link');

            // Ensure LoginType is updated just in case the click misses
            await page.evaluate(() => {
                document.getElementById('LoginType').value = '2';
            });
        } catch (e) {
            logCallback(`[DEBUG] Failed to find Validation tab. Dumping page...`);
            const html = await page.content();
            logCallback(`[DEBUG_HTML] ${html.substring(0, 6000)}`);
            throw new Error(`Cloud Run blocked navigation or page failed to load: ${e.message}`);
        }

        // Small wait for transition
        await new Promise(r => setTimeout(r, 500));

        logCallback(`Logging in...`);
        // Handle any alerts that might pop up (like "Username cannot be empty")
        page.on('dialog', async dialog => {
            logCallback(`[DEBUG] Dialog popped up: ${dialog.message()}`);
            await dialog.accept();
        });

        // The form has #UserName and #Password. They are shared across tabs.
        await page.waitForSelector('#UserName', { visible: true });
        const ipassUser = process.env.IPASS_USER || 'scheng';
        const ipassPass = process.env.IPASS_PASS || 'scheng';

        // Clear inputs first just in case
        await page.click('#UserName', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#UserName', ipassUser);

        await page.click('#Password', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#Password', ipassPass);

        // Debug screenshots disabled
        // await page.screenshot({ path: 'before_login.png', fullPage: true });

        logCallback(`Submitting login form...`);
        // Trigger form submission explicitly instead of relying on puppeteer's click which might miss
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => logCallback(`[DEBUG] Navigation timeout after login: ${e.message}`)),
            page.evaluate(() => {
                const btn = document.getElementById('login-submit');
                if (btn) btn.click();
                else document.getElementById('login-form').submit();
            })
        ]);

        logCallback(`Wait over. Checking for mainPageContent...`);
        // Wait for a key element on the validation dashboard to confirm we are logged in
        try {
            await page.waitForSelector('.mainPageContent', { visible: true, timeout: 15000 });
        } catch (e) {
            logCallback(`[DEBUG] Login failed or hang detected.`);
            const html = await page.content();
            logCallback(`[DEBUG_HTML] ${html.substring(0, 1000)}...`);
            throw e;
        }

        logCallback(`Login successful. Current URL: ${page.url()}`);

        // 5. Process entries
        let processedCount = 0;

        // Debug dumps disabled
        // const dashboardHtml = await page.content();
        // require('fs').writeFileSync('dashboard.html', dashboardHtml);
        // logCallback(`[DEBUG] Dumped dashboard HTML to dashboard.html for inspection.`);

        // Helper to update a cell in the old sheet if processing failed
        async function updateCellFallback(row, colIndex, value) {
            if (colIndex === undefined) return;
            let temp, letter = '';
            let col = colIndex;
            while (col >= 0) {
                temp = col % 26;
                letter = String.fromCharCode(temp + 65) + letter;
                col = (col - temp - 26) / 26;
            }
            const range = `New Application!${letter}${row}`;
            const sheetsLocal = google.sheets({ version: 'v4', auth: await getAuthClient() });
            await sheetsLocal.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[value]] }
            });
        }

        // Helper to append a row to history and delete the source dimension
        async function completeRowAndMove(entry, finalStatus, finalLog) {
            try {
                // Update the array in memory
                const rowData = [...entry.rawData];
                if (entry.statusIdx !== undefined) rowData[entry.statusIdx] = finalStatus;
                if (entry.logIdx !== undefined) rowData[entry.logIdx] = finalLog;
                
                // Ensure the row has enough columns up to the max index
                const maxIndex = Math.max(entry.statusIdx || 0, entry.logIdx || 0);
                while (rowData.length <= maxIndex) rowData.push('');

                logCallback(`   Appending Row ${entry.rowIndex} to 'Application History'...`);
                const sheetsLocal = google.sheets({ version: 'v4', auth: await getAuthClient() });
                await sheetsLocal.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Application History!A1',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    resource: { values: [rowData] }
                });

                // Find the sheetId for 'New Application' to delete the row
                const meta = await sheetsLocal.spreadsheets.get({
                    spreadsheetId: SPREADSHEET_ID,
                    fields: "sheets(properties(sheetId,title))"
                });
                const sheetTabId = meta.data.sheets.find(s => s.properties.title === 'New Application')?.properties?.sheetId || 0;

                logCallback(`   Deleting original Row ${entry.rowIndex} from 'New Application'...`);
                await sheetsLocal.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    resource: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: sheetTabId,
                                    dimension: "ROWS",
                                    startIndex: entry.rowIndex - 1, // 0-based index
                                    endIndex: entry.rowIndex // exclusive
                                }
                            }
                        }]
                    }
                });
                logCallback(`   Row ${entry.rowIndex} move complete.`);
                return true;
            } catch (moveErr) {
                logCallback(`   [!] Failed to move row: ${moveErr.message}`);
                return false;
            }
        }


        for (const entry of rowsToProcess) {
            try {
                if (entry.statusOriginal === 'rejected') {
                    logCallback(`Processing REJECTED row ${entry.rowIndex} directly...`);
                    await completeRowAndMove(entry, 'Rejected', 'Request Rejected');
                    processedCount++;
                    continue; // Skip IPASS entirely
                }

                // If approved, run IPASS automation sequence
                logCallback(`Processing APPROVED Plate ${entry.plate}, Name: ${entry.name}, Expiry Date ${entry.expiry}..`);

                // Fill Form
                // Helper to wait for the loader panel to disappear
                const waitForAjax = async (timeoutMs = 15000) => {
                    await new Promise(r => setTimeout(r, 500)); // give it a moment to appear
                    try {
                        await page.waitForFunction(() => {
                            const loader = document.getElementById('loader_panel');
                            return !loader || window.getComputedStyle(loader).display === 'none';
                        }, { timeout: timeoutMs });
                    } catch (e) {
                        logCallback(`[DEBUG] Timeout waiting for AJAX loader`);
                    }
                    await new Promise(r => setTimeout(r, 500)); // short buffer after it hides
                };

                // Wait for dashboard to fully load
                await waitForAjax();

                // 1. Wait for dashboard to fully load initially
                await waitForAjax();

                // 2. TEXT FIELDS
                const safeName = (entry.name || '').replace(/[^a-zA-Z\s\-]/g, '');
                if (safeName) {
                    try {
                        const nameSel = await page.evaluate(() => {
                            if (document.querySelector('#VisitorName')) return '#VisitorName';
                            if (document.querySelector('#UserName')) return '#UserName';
                            return 'input[name="UserName"]';
                        });
                        logCallback(`[DEBUG] Typed Name: ${safeName}`);
                        await page.click(nameSel, { clickCount: 3 });
                        await page.keyboard.press('Backspace');
                        await page.type(nameSel, safeName);
                        await page.evaluate((s) => {
                            const e = document.querySelector(s);
                            if (e) e.dispatchEvent(new Event('change'));
                        }, nameSel);
                        await waitForAjax();
                    } catch (e) { }
                }

                if (entry.email) {
                    await page.click('#Email', { clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await page.type('#Email', entry.email);
                    await page.evaluate(() => document.querySelector('#Email').dispatchEvent(new Event('change')));
                    await waitForAjax();
                }

                if (entry.name) {
                    await page.click('#Notes', { clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await page.type('#Notes', `${entry.name} - Annual Request`);
                    await page.evaluate(() => document.querySelector('#Notes').dispatchEvent(new Event('change')));
                    await waitForAjax();
                }

                // 3. DATE LOGIC LAST
                let isNextYear = false;
                let targetYear = new Date().getFullYear();
                let formattedExpiry = entry.expiry;

                if (entry.expiry) {
                    const match = String(entry.expiry).match(/\d{4}/);
                    if (match) {
                        const expYear = parseInt(match[0]);
                        if (expYear > targetYear) {
                            isNextYear = true;
                            targetYear = expYear;
                        }
                    }
                    if (entry.expiry.includes('-')) {
                        const parts = entry.expiry.split('-');
                        if (parts[0].length === 4) { // YYYY-MM-DD to MM/DD/YYYY
                            formattedExpiry = `${parts[1]}/${parts[2]}/${parts[0]}`;
                        }
                    }
                }

                if (isNextYear) {
                    logCallback(`   Expiry is next year. Adjusting Start Date...`);
                    const hasStartToggle = await page.$('#StartTimeChoose');
                    if (hasStartToggle) {
                        const isChecked = await page.$eval('#StartTimeChoose', el => el.checked);
                        if (!isChecked) {
                            await page.evaluate(() => document.querySelector('#StartTimeChoose').click());
                            await waitForAjax();
                        }
                        const hasStartD = await page.$('#StartD');
                        if (hasStartD) {
                            await page.click('#StartD', { clickCount: 3 });
                            await page.keyboard.press('Backspace');
                            await page.type('#StartD', `01/01/${targetYear}`);
                            await page.evaluate(() => document.querySelector('#StartD').dispatchEvent(new Event('change')));
                            await waitForAjax();
                        }
                    }
                }

                if (entry.expiry) {
                    logCallback(`   Setting Expiry Date to ${formattedExpiry}...`);
                    const hasEndToggle = await page.$('#EndTimeChoose');
                    if (hasEndToggle) {
                        const isChecked = await page.$eval('#EndTimeChoose', el => el.checked);
                        if (!isChecked) {
                            await page.evaluate(() => document.querySelector('#EndTimeChoose').click());
                            await waitForAjax();
                        }
                        const hasEndD = await page.$('#EndD');
                        if (hasEndD) {
                            await page.evaluate((dateStr) => {
                                // The site uses jQuery UI datepicker. Typing triggers change events that recalculate 1 day from Start.
                                // We must tell the datepicker plugin directly to bypass the typed input restrictions.
                                if (window.$ && window.$('#EndD').length) {
                                    window.$('#EndD').datepicker('setDate', dateStr);
                                    // Trigger change so site's other scripts pick up the new date to calculate duration
                                    window.$('#EndD').trigger('change');
                                } else {
                                    // Fallback
                                    document.getElementById('EndD').value = dateStr;
                                    document.getElementById('EndD').dispatchEvent(new Event('change'));
                                }
                            }, formattedExpiry);

                            await waitForAjax();
                        }
                    }
                }

                // Wait one final time for any straggling AJAX date updates to clear
                await waitForAjax();

                // 3.5. LICENSE PLATE LAST
                const rawPlate = String(entry.plate || '');
                const cleanPlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                logCallback(`[DEBUG] Finalizing Cleaned Plate: ${cleanPlate}`);

                await page.waitForSelector('#LicencePlate', { visible: true });
                // We inject it directly via jQuery to perfectly simulate IPASS's expected behavior
                // which fires 'change' and immediately executes their $.post('/v2/Validation/SubmitPlate')
                await page.evaluate((plate) => {
                    const $lp = window.jQuery('#LicencePlate');
                    if ($lp.length) {
                        $lp.val(plate).trigger('change');
                    } else {
                        // Fallback if jQuery isn't exposed exactly where we look
                        const el = document.getElementById('LicencePlate');
                        el.value = plate;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, cleanPlate);

                // MUST wait for SubmitPlate AJAX call to finish recording the plate on the server session!
                await waitForAjax();

                // 4. ISSUE VALIDATION (2-STEP)
                logCallback(`   Issuing validation...`);
                // await page.screenshot({ path: 'before_issue.png', fullPage: true });

                // Step 1: Click the PreSubmit button on the main form
                await page.evaluate(() => {
                    const btn = document.querySelector('#ValidationDetailForm button[type="submit"]');
                    if (btn) btn.click();
                });

                // Wait for the confirmation modal to appear (usually '#ValidationModal')
                await waitForAjax();
                await new Promise(r => setTimeout(r, 1000)); // animation time

                // await page.screenshot({ path: 'after_presubmit.png', fullPage: true });

                // Step 2: Click the ACTUAL "Issue Validation" button on the modal popup
                await page.evaluate(() => {
                    if (typeof SubmitValidation === 'function') {
                        SubmitValidation();
                    } else {
                        // fallback to finding the modal button
                        const modalBtns = Array.from(document.querySelectorAll('#ValidationModal .modal-footer button'));
                        const confirmBtn = modalBtns.find(b => b.innerText.includes('Issue'));
                        if (confirmBtn) confirmBtn.click();
                    }
                });

                await waitForAjax();

                // 6. Breeze API & Email
                logCallback(`   Done IPASS. Triggering Breeze update and Email for Row ${entry.rowIndex}...`);
                const breezeResult = await updateBreezeAndEmail(entry, logCallback);

                // 7. Update Google Sheet
                logCallback(`   Finalizing Google Sheet Row ${entry.rowIndex}...`);

                // If everything (IPASS + Breeze) went well, move it to history
                if (breezeResult.breezeSuccess) {
                    const logMsg = breezeResult.emailSuccess ? '✅ Breeze Updated | ✅ IPass Updated' : '✅ Breeze Updated | ✅ IPass Updated (Email Failed)';
                    await completeRowAndMove(entry, 'Completed', logMsg);
                } else {
                    // Update log cell but leave row in place
                    await updateCellFallback(entry.rowIndex, entry.logIdx, `❌ Breeze Failed: ${breezeResult.message}`);
                }

                logCallback(`   Row ${entry.rowIndex} fully complete.`);
                processedCount++;

            } catch (err) {
                logCallback(`   [!] Error processing row ${entry.rowIndex}: ${err.message}`);

                // Keep Status as 'Approved', but write the error to the Log column
                try {
                    await updateCellFallback(entry.rowIndex, entry.logIdx, `❌ IPASS Error: ${err.message}`);
                } catch (writeErr) {
                    logCallback(`   [!] Also failed to write error to Google Sheet: ${writeErr.message}`);
                }
            }
        }

        logCallback(`Finished processing ${processedCount} records.`);
        return { success: true, processed: processedCount };

    } catch (e) {
        logCallback(`FATAL ERROR: ${e.message}`);
        return { success: false, error: e.message };
    } finally {
        if (browser) {
            logCallback(`Closing browser...`);
            await browser.close();
        }
    }
}

module.exports = {
    getPendingIpassRecords,
    runIpassSync
};
