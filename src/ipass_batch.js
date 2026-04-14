const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { google } = require('googleapis');
const path = require('path');

// Google Sheets auth
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const KEY_PATH = path.join(__dirname, '../service-account.json');

const SPREADSHEET_ID = '1sHRgeO2ICVR8xZpUk8OophfrG7dpHDNdiXMuSuMRpr4';
const RANGE_TO_READ = 'Sheet1!A:Z';

let authClient = null;

async function getAuthClient() {
    if (!authClient) {
        const authConfig = { scopes: SCOPES };
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

        if (credentialsJson) {
            try {
                authConfig.credentials = JSON.parse(credentialsJson);
            } catch (e) {
                console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON in ipass_batch.js');
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

async function getPendingIpassBatchRecords() {
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
    const nameIdx = colMap['Name'];
    
    if (statusIdx === undefined) {
        throw new Error(`Could not find required column in header: Status`);
    }

    const rowsToProcess = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[statusIdx] || '';

        // Process if Status is BLANK
        if (status.trim() === '') {
            rowsToProcess.push({
                rowIndex: i + 1, // 1-based, plus header = i+1
                plate: row[plateIdx] || '',
                email: row[emailIdx] || '',
                name: (row[nameIdx] || '').trim(),
                statusIdx: statusIdx
            });
        }
    }
    
    return rowsToProcess;
}

async function runIpassBatchSync(logCallback = console.log) {

    let browser = null;
    try {
        logCallback(`Starting IPASS Batch Sync Process...`);

        const rowsToProcess = await getPendingIpassBatchRecords();

        logCallback(`Found ${rowsToProcess.length} blank records needing processing.`);

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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        page.on('console', msg => {
            logCallback(`[IPASS BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        logCallback(`Navigating to IPASS...`);
        page.goto('https://ipass.preciserd.com/v2/', { timeout: 60000 }).catch(e => {
            logCallback(`[DEBUG] page.goto warning: ${e.message}`);
        });

        logCallback(`Switching to Validation tab...`);
        try {
            await page.waitForSelector('#validation-form-link', { visible: true, timeout: 60000 });
            await new Promise(r => setTimeout(r, 1000));
            await page.click('#validation-form-link');

            await page.evaluate(() => {
                document.getElementById('LoginType').value = '2';
            });
        } catch (e) {
            logCallback(`[DEBUG] Failed to find Validation tab. Dumping page...`);
            throw new Error(`Cloud Run blocked navigation or page failed to load: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 500));

        logCallback(`Logging in...`);
        page.on('dialog', async dialog => {
            logCallback(`[DEBUG] Dialog popped up: ${dialog.message()}`);
            await dialog.accept();
        });

        await page.waitForSelector('#UserName', { visible: true });
        const ipassUser = process.env.IPASS_USER || 'scheng';
        const ipassPass = process.env.IPASS_PASS || 'scheng';

        await page.click('#UserName', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#UserName', ipassUser);

        await page.click('#Password', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#Password', ipassPass);

        logCallback(`Submitting login form...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => logCallback(`[DEBUG] Navigation timeout after login: ${e.message}`)),
            page.evaluate(() => {
                const btn = document.getElementById('login-submit');
                if (btn) btn.click();
                else document.getElementById('login-form').submit();
            })
        ]);

        logCallback(`Wait over. Checking for mainPageContent...`);
        try {
            await page.waitForSelector('.mainPageContent', { visible: true, timeout: 15000 });
        } catch (e) {
            logCallback(`[DEBUG] Login failed or hang detected.`);
            throw e;
        }

        logCallback(`Login successful. Current URL: ${page.url()}`);

        let processedCount = 0;

        async function updateCellFallback(row, colIndex, value) {
            if (colIndex === undefined) return;
            let temp, letter = '';
            let col = colIndex;
            while (col >= 0) {
                temp = col % 26;
                letter = String.fromCharCode(temp + 65) + letter;
                col = (col - temp - 26) / 26;
            }
            const range = `Sheet1!${letter}${row}`;
            const sheetsLocal = google.sheets({ version: 'v4', auth: await getAuthClient() });
            await sheetsLocal.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[value]] }
            });
        }

        for (const entry of rowsToProcess) {
            try {
                logCallback(`Processing Plate ${entry.plate}, Name: ${entry.name}..`);

                const waitForAjax = async (timeoutMs = 15000) => {
                    await new Promise(r => setTimeout(r, 300));
                    try {
                        await page.waitForFunction(() => {
                            if (window.jQuery) {
                                return window.jQuery.active === 0;
                            }
                            const loader = document.getElementById('loader_panel');
                            return !loader || window.getComputedStyle(loader).display === 'none' || window.getComputedStyle(loader).visibility === 'hidden' || window.getComputedStyle(loader).opacity === '0';
                        }, { timeout: timeoutMs });
                    } catch (e) {
                        logCallback(`[DEBUG] Timeout waiting for AJAX`);
                    }
                    await new Promise(r => setTimeout(r, 200));
                };

                await waitForAjax();
                await waitForAjax();

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
                    await page.type('#Notes', `${entry.name} - Batch Request`);
                    await page.evaluate(() => document.querySelector('#Notes').dispatchEvent(new Event('change')));
                    await waitForAjax();
                }

                // Custom Expiry Date logic for batch
                const now = new Date();
                let expYear = now.getFullYear();
                if (now.getMonth() >= 10) { // Nov = 10, Dec = 11
                    expYear++;
                }
                const formattedExpiry = `12/31/${expYear}`;
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
                            if (window.$ && window.$('#EndD').length) {
                                window.$('#EndD').datepicker('setDate', dateStr);
                                window.$('#EndD').trigger('change');
                            } else {
                                document.getElementById('EndD').value = dateStr;
                                document.getElementById('EndD').dispatchEvent(new Event('change'));
                            }
                        }, formattedExpiry);
                        await waitForAjax();
                    }
                }
                const rawPlate = String(entry.plate || '');
                const cleanPlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                logCallback(`[DEBUG] Finalizing Cleaned Plate: ${cleanPlate}`);

                await page.waitForSelector('#LicencePlate', { visible: true });
                await page.evaluate((plate) => {
                    const $lp = window.jQuery('#LicencePlate');
                    if ($lp.length) {
                        $lp.val(plate).trigger('change');
                    } else {
                        const el = document.getElementById('LicencePlate');
                        el.value = plate;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, cleanPlate);

                await waitForAjax();

                logCallback(`   Issuing validation...`);

                await page.evaluate(() => {
                    const btn = document.querySelector('#ValidationDetailForm button[type="submit"]');
                    if (btn) btn.click();
                });

                await waitForAjax();
                await new Promise(r => setTimeout(r, 1000));

                await page.evaluate(() => {
                    if (typeof SubmitValidation === 'function') {
                        SubmitValidation();
                    } else {
                        const modalBtns = Array.from(document.querySelectorAll('#ValidationModal .modal-footer button'));
                        const confirmBtn = modalBtns.find(b => b.innerText.includes('Issue'));
                        if (confirmBtn) confirmBtn.click();
                    }
                });

                await waitForAjax();

                logCallback(`   Done IPASS. Finalizing Google Sheet Row ${entry.rowIndex}...`);

                // Output status to 'Status' col and timestamp to Col I (index 8)
                await updateCellFallback(entry.rowIndex, entry.statusIdx, `Completed`);
                
                const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                await updateCellFallback(entry.rowIndex, 8, timestamp);

                logCallback(`   Row ${entry.rowIndex} fully complete.`);
                processedCount++;

            } catch (err) {
                logCallback(`   [!] Error processing row ${entry.rowIndex}: ${err.message}`);
                try {
                    await updateCellFallback(entry.rowIndex, entry.statusIdx, `Error: ${err.message}`);
                } catch (writeErr) {
                    logCallback(`   [!] Also failed to write error to Google Sheet: ${writeErr.message}`);
                }
            }
            
            // Reset form for the next record without reloading the page (prevents Chromium memory leaks)
            if (entry !== rowsToProcess[rowsToProcess.length - 1]) {
                logCallback(`   Resetting Validation form for next record...`);
                
                try {
                    // 1. Forcefully remove any lingering success modals or backdrops
                    await page.evaluate(() => {
                        document.querySelectorAll('.modal').forEach(m => {
                            m.classList.remove('show');
                            m.style.display = 'none';
                        });
                        document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
                        document.body.classList.remove('modal-open');
                        
                        // Reset the actual form fields
                        const form = document.getElementById('ValidationDetailForm');
                        if (form) form.reset();
                    });

                    // 2. Click the validation tab to cleanly re-initiate the form via the site's own AJAX
                    await page.evaluate(() => {
                        const link = document.querySelector('#validation-form-link');
                        if (link) link.click();
                    });
                    
                    // Give the site's AJAX time to load the clean form
                    await new Promise(r => setTimeout(r, 1500));
                    
                    await page.evaluate(() => {
                        const lt = document.getElementById('LoginType');
                        if (lt) lt.value = '2';
                    });
                    
                } catch (e) {
                    logCallback(`[DEBUG] Failed to reset form for next record: ${e.message}`);
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
    getPendingIpassBatchRecords,
    runIpassBatchSync
};
