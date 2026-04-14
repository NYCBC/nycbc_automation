const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import our existing modules
const zoom = require('./zoom');
const sheets = require('./sheets');
const { sendInvitations } = require('./send-invites');
const ipass = require('./ipass');
const ipassBatch = require('./ipass_batch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Endpoint to get Member Info by Token
app.get('/api/member/:token', async (req, res) => {
    try {
        const token = req.params.token;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }

        const member = await sheets.findMemberByToken(token);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }

        // Return only necessary info (no sensitive internal IDs unless needed)
        // [v2.1 Fix] Ensure we send the raw parts so frontend can construct display name
        res.json({
            success: true,
            member: {
                // Ensure Sheets.js returns firstNameOnly and nickname
                firstName: member.firstName,
                firstNameOnly: member.firstNameOnly,
                nickname: member.nickname,
                lastName: member.lastName,
                email: member.email,
                congregation: member.congregation,
                membershipStatus: member.membershipStatus
            }
        });
    } catch (error) {
        console.error('Token Lookup Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DEBUG ENDPOINT
app.get('/api/debug-user', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).send('Email required');

        const rowNumber = await sheets.findRowByEmail(email);
        if (!rowNumber) return res.status(404).send('Row not found for email');

        const members = await sheets.getAllMembers();
        const profileMember = members.find(m => m.email.toLowerCase() === email.toLowerCase());

        // Debug: Get raw row from Reg Sheet
        let regSheetData = null;
        if (rowNumber && sheets.debugRegistrationRow) {
            regSheetData = await sheets.debugRegistrationRow(rowNumber);
        }

        res.json({
            source: 'ProfileSheet & RegSheet Debug',
            profileData: profileMember,
            regSheetRowIndex: rowNumber,
            regSheetData: regSheetData,
            envSheetId: process.env.GOOGLE_SHEET_ID,
            internalRegSheetId: sheets.regSheetId
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// API Endpoint to handle Registration Form Submission
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, congregation, translation, proxy, proxyName } = req.body;

        console.log(`Received registration for: ${firstName} ${lastName} (${email})`);

        // 1. Check if user is in the Member Sheet
        const rowNumber = await sheets.findRowByEmail(email);
        if (!rowNumber) {
            console.error(`Email not found in Members sheet: ${email}`);
            return res.status(400).json({
                success: false,
                message: 'Registration Denied: Your email was not found in the member list. Please contact the church office.'
            });
        }

        // 2. Register on Zoom
        const meetingId = process.env.ZOOM_MEETING_ID;
        const zoomResult = await zoom.addRegistrant(meetingId, email, firstName, lastName);

        if (zoomResult.join_url || zoomResult.registrant_id || zoomResult.status === 'already_registered') {
            const joinUrl = zoomResult.join_url || 'Already Registered';

            // 3. Update Google Sheet (Columns I-L)
            await sheets.updateRegistration(rowNumber, {
                email,
                translation,
                proxy,
                proxyName,
                joinUrl: 'Completed' // Change: Write "Completed" instead of URL
            });

            // 4. [NEW] Sync to Support Sheet (Registrants Tab)
            let syncStatus = 'Completed';
            try {
                const params = await sheets.getParameters();
                const supportSheetId = params['BMM Support Sheet ID'];
                if (supportSheetId) {
                    const syncSuccess = await sheets.copyRowToSupportSheet(rowNumber, supportSheetId);
                    if (syncSuccess) {
                        syncStatus = 'Completed - Sync: OK';
                    } else {
                        syncStatus = 'Completed - Sync: Failed (Check Cloud Run Logs)';
                    }
                } else {
                    syncStatus = 'Completed - Sync: Skipped (No ID)';
                }
            } catch (syncErr) {
                console.error('Failed to sync to Support Sheet:', syncErr);
                syncStatus = `Completed - Sync Error: ${syncErr.message}`;
            }

            // 5. Final Update to Main Sheet (Write Sync Status)
            try {
                await sheets.updateRegistration(rowNumber, {
                    email,
                    translation,
                    proxy,
                    proxyName,
                    joinUrl: syncStatus
                });
            } catch (ignore) { }

            res.json({ success: true, joinUrl: syncStatus, debug_version: 'v2-sync-debug' }); // Send status back to client too
        } else {
            res.status(500).json({ success: false, message: 'Zoom registration failed', details: zoomResult });
        }

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Lock for Invite Process to prevent multiple concurrent runs (e.g. from browser refresh or retries)
let isSendingInvites = false;
let isSyncingIpass = false;
let isSyncingIpassBatch = false;

// API Endpoint to Trigger IPASS Sync (Protected)
app.get('/api/admin/trigger-ipass', async (req, res) => {
    try {
        const key = req.query.key;
        const ADMIN_SECRET = process.env.ADMIN_SECRET;

        // Security Check
        if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Admin Key' });
        }

        if (isSyncingIpass) {
            return res.status(409).send('Conflict: IPASS Sync is already running.');
        }

        const confirmKey = req.query.confirm;
        if (confirmKey !== 'nycbc') {
            let pendingCount = '?';
            try {
                const pending = await ipass.getPendingIpassRecords();
                pendingCount = pending.length;
            } catch (err) {
                console.error("Error reading pending records for UI:", err);
            }

            const confirmUrl = `${req.protocol}://${req.get('host')}${req.path}?key=${key}&confirm=nycbc`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.write('<!DOCTYPE html><html><body style="font-family: monospace; background: #222; color: #eee; padding: 20px;">');
            res.write(`
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background: #333; border: 1px solid #555; border-radius: 8px; text-align: center;">
                    <strong style="color: #ff9800; font-size: 1.4em; display: block; margin-bottom: 20px;">⚠️ Confirmation Required</strong>
                    <p style="font-size: 1.1em; color: #ddd; margin-bottom: 10px;">Are you sure you want to run the IPASS Automation Script manually?</p>
                    <p style="font-size: 1.2em; color: #4fc3f7; margin-bottom: 30px;">There are <strong>${pendingCount}</strong> approved/rejected record(s) ready to process.</p>
                    <a href="${confirmUrl}" style="display: inline-block; padding: 15px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 1.2em; transition: background 0.3s;">
                        ✅ CONFIRM & START IPASS SYNC
                    </a>
                </div>
            </body></html>`);
            res.end();
            return;
        }

        isSyncingIpass = true;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.write('<!DOCTYPE html><html><body style="font-family: monospace; background: #222; color: #eee; padding: 20px;">');
        res.write('<h3>NYCBC IPASS Parking Permit Sync</h3><pre id="log">');

        try {
            const result = await ipass.runIpassSync((msg) => {
                if (msg.startsWith('Starting') || msg.startsWith('Found') || msg.startsWith('Plate') || msg.startsWith('Finished') || msg.startsWith('FATAL') || msg.startsWith('   [!] Error')) {
                    res.write(msg + '\n');
                }
            });

            res.write('</pre>');

            if (!result || result.success === false) {
                res.write('<p style="color: red;">Process Aborted or Failed silently.</p>');
                res.write(`<pre style="color: red;">${result ? result.error : 'Unknown'}</pre>`);
            } else {
                res.write('<p style="color: lightgreen;">✨ Process Finished Successfully.</p>');
                res.write(`<details><summary>Raw Result</summary><pre>${JSON.stringify(result, null, 2)}</pre></details>`);
            }

            res.write('</body></html>');

        } catch (err) {
            console.error('Error during runIpassSync:', err);
            res.write(`\nError: ${err.message}\n`);
        } finally {
            isSyncingIpass = false;
            res.end();
        }

    } catch (error) {
        console.error('Trigger Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server Error', error: error.message });
        } else {
            res.end();
        }
        isSyncingIpass = false;
    }
});

// API Endpoint to Trigger IPASS BATCH Sync (Protected)
app.get('/api/admin/trigger-ipass-batch', async (req, res) => {
    try {
        const key = req.query.key;
        const ADMIN_SECRET = process.env.ADMIN_SECRET;

        // Security Check
        if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Admin Key' });
        }

        if (isSyncingIpassBatch) {
            return res.status(409).send('Conflict: IPASS Batch Sync is already running.');
        }

        const confirmKey = req.query.confirm;
        if (confirmKey !== 'nycbc') {
            let pendingCount = '?';
            try {
                const pending = await ipassBatch.getPendingIpassBatchRecords();
                pendingCount = pending.length;
            } catch (err) {
                console.error("Error reading pending records for UI:", err);
            }

            const confirmUrl = `${req.protocol}://${req.get('host')}${req.path}?key=${key}&confirm=nycbc`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.write('<!DOCTYPE html><html><body style="font-family: monospace; background: #222; color: #eee; padding: 20px;">');
            res.write(`
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background: #333; border: 1px solid #555; border-radius: 8px; text-align: center;">
                    <strong style="color: #ff9800; font-size: 1.4em; display: block; margin-bottom: 20px;">⚠️ Confirmation Required</strong>
                    <p style="font-size: 1.1em; color: #ddd; margin-bottom: 10px;">Are you sure you want to run the IPASS **BATCH** Automation Script manually?</p>
                    <p style="font-size: 1.2em; color: #4fc3f7; margin-bottom: 30px;">There are <strong>${pendingCount}</strong> blank record(s) ready to process.</p>
                    <a href="${confirmUrl}" style="display: inline-block; padding: 15px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 1.2em; transition: background 0.3s;">
                        ✅ CONFIRM & START IPASS BATCH SYNC
                    </a>
                </div>
            </body></html>`);
            res.end();
            return;
        }

        isSyncingIpassBatch = true;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.write('<!DOCTYPE html><html><body style="font-family: monospace; background: #222; color: #eee; padding: 20px;">');
        res.write('<h3>NYCBC IPASS Permit Batch Update Log</h3><pre id="log">');

        try {
            const result = await ipassBatch.runIpassBatchSync((msg) => {
                if (msg.startsWith('Starting') || msg.startsWith('Found') || msg.startsWith('Processing Plate') || msg.startsWith('Finished') || msg.startsWith('FATAL') || msg.startsWith('   [!] Error')) {
                    res.write(msg + '\n');
                }
            });

            res.write('</pre>');

            if (!result || result.success === false) {
                res.write('<p style="color: red;">Process Aborted or Failed silently.</p>');
                res.write(`<pre style="color: red;">${result ? result.error : 'Unknown'}</pre>`);
            } else {
                res.write('<p style="color: lightgreen;">✨ Process Finished Successfully.</p>');
                res.write(`<details><summary>Raw Result</summary><pre>${JSON.stringify(result, null, 2)}</pre></details>`);
            }

            res.write('</body></html>');

        } catch (err) {
            console.error('Error during runIpassBatchSync:', err);
            res.write(`\nError: ${err.message}\n`);
        } finally {
            isSyncingIpassBatch = false;
            res.end();
        }

    } catch (error) {
        console.error('Trigger Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server Error', error: error.message });
        } else {
            res.end();
        }
        isSyncingIpassBatch = false;
    }
});

// API Endpoint to Trigger Invitations Manually (Protected)
app.get('/api/admin/trigger-invites', async (req, res) => {
    try {
        const key = req.query.key;
        const ADMIN_SECRET = process.env.ADMIN_SECRET;

        // Security Check
        if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Admin Key' });
        }

        // Concurrency Lock
        if (isSendingInvites) {
            return res.status(409).send('Conflict: Invitation process is already running. Please do not refresh.');
        }

        isSendingInvites = true;
        console.log('Triggering invitation process via Web API...');
        console.log(`[DEBUG] Request URL: ${req.originalUrl}`);
        console.log(`[DEBUG] Request Query:`, req.query);

        // Set Headers for Streaming Response (Text/HTML)
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.write('<!DOCTYPE html><html><body style="font-family: monospace; background: #222; color: #eee; padding: 20px;">');
        res.write('<h3>NYCBC Batch Invitation Log (V2 - BATCHING ENABLED)</h3><pre id="log">');
        res.write(`DEBUG: Request URL: ${req.originalUrl}\n`);
        res.write('Starting invitation process...\n');

        const confirmKey = req.query.confirm; // Check for ?confirm=nycbc

        // Run the script with progress callback
        try {
            const result = await sendInvitations((msg) => {
                res.write(msg); // Stream output to client
            }, confirmKey); // Pass confirmation key

            res.write('</pre>'); // Close log block

            if (result && result.waitingForConfirmation) {
                // Generate Confirmation Link
                const confirmUrl = `${req.protocol}://${req.get('host')}${req.path}?key=${key}&confirm=nycbc`;
                res.write(`
                    <div style="margin-top: 20px; padding: 15px; background: #444; border: 1px solid #777; border-radius: 5px;">
                        <strong style="color: #ff9800; font-size: 1.2em;">⚠️ Confirmation Required</strong>
                        <p>Please review the summary above. If correct, click below to proceed:</p>
                        <a href="${confirmUrl}" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            ✅ CONFIRM & SEND EMAILS
                        </a>
                    </div>
                `);
            } else if (!result || result.success === false) {
                // Catch case where result is returned but waitingForConfirmation is false (e.g. 0 to send)
                if (result && result.sent === 0) {
                    res.write(`
                        <div style="margin-top: 20px; padding: 15px; background: #555; border: 1px solid #777; border-radius: 5px;">
                            <strong style="color: #4fc3f7; font-size: 1.2em;">ℹ️ No New Invites to Send</strong>
                            <p>No suitable candidates were found. Likely reasons:</p>
                            <ul style="text-align: left;">
                                <li>Already Registered: <strong>${(result.stats && result.stats.registered) || 0}</strong> (Column L populated)</li>
                                <li>Already Invited: <strong>${(result.stats && result.stats.invited) || 0}</strong> (Column M has token)</li>
                                <li><strong>Website Reg: ${(result.stats && result.stats.website) || 0}</strong> (Column M has 'Website', clear this if you want to re-invite)</li>
                            </ul>
                        </div>
                    `);
                } else {
                    res.write('<p style="color: red;">Process Aborted or Failed silently.</p>');
                }
            } else {
                res.write('<p style="color: lightgreen;">✨ Process Finished Successfully.</p>');
                res.write(`<details><summary>Raw Result</summary><pre>${JSON.stringify(result, null, 2)}</pre></details>`);
            }

            res.write('</body></html>');

        } catch (err) {
            console.error('Error during sendInvitations:', err);
            res.write(`\nError: ${err.message}\n`);
        } finally {
            isSendingInvites = false;
            res.end();
        }

    } catch (error) {
        console.error('Trigger Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Server Error', error: error.message });
        } else {
            res.end();
        }
        isSendingInvites = false;
    }
});

// DEBUG ENDPOINT for Sync Permissions
app.get('/api/admin/debug-sync', async (req, res) => {
    try {
        const key = req.query.key;
        if (key !== process.env.ADMIN_SECRET) return res.status(401).send('Unauthorized');

        const logs = [];
        const log = (m) => logs.push(m);

        log('1. Fetching Parameters...');
        const params = await sheets.getParameters();
        const targetId = params['BMM Support Sheet ID'];
        log(`Target Sheet ID: ${targetId}`);

        if (!targetId) {
            return res.json({ success: false, logs });
        }

        log('2. Attempting to sync Row 2...');
        try {
            // Need to verify if Row 2 exists or simply try it.
            // This runs AS the Cloud Run Service Account.
            const result = await sheets.copyRowToSupportSheet(2, targetId);
            log(`Sync Result: ${result}`);

            if (result) {
                log('SUCCESS: Permission is good and Tab "Registrants" exists.');
            } else {
                log('FAILURE: Check logs. Likely permission or missing tab.');
            }
        } catch (e) {
            log(`ERROR: ${e.message}`);
        }

        res.json({ success: true, logs });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
