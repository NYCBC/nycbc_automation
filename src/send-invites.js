require('dotenv').config();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const sheets = require('./sheets');
const zoom = require('./zoom');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// Configure Email Transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // App Password, not login password
    }
});

const readline = require('readline');

async function sendInvitations(progressCallback = () => { }, preConfirmKey = null) {
    const log = (msg) => {
        console.log(msg);
        progressCallback(msg + '\n');
    };

    // 1. Fetch Configuration (Parameters)
    log('Fetching Parameters from Google Sheet...');
    const params = await sheets.getParameters();

    // Mapping: Sheet Key -> Variable
    const bmmMeeting = params['BMM Meeting'] || "Church Meeting";
    const bmmDate = params['BMM Date'] || "TBD";
    const bmmTime = params['BMM Time'] || "TBD";
    const customSubject = params['Invitation Email Subject'];

    log(`Parameters Loaded:`);
    log(`  Meeting: ${bmmMeeting}`);
    log(`  Date:    ${bmmDate}`);
    log(`  Time:    ${bmmTime}`);
    if (customSubject) log(`  Subject: ${customSubject} (Overrides Template)`);

    // 2. Fetch Email Template
    log('Fetching email template...');
    const DOC_ID = '1lOEyMZ1QjF6zWbNodUmiOyZ3RLpiiTJpDz3CXM_CsFw';
    let template = { subject: 'Invitation: NYCBC 2025 4th BMM Registration', html: '' }; // Fallback

    try {
        template = await require('./doc-template').getTemplate(DOC_ID);
        log(`Loaded template: "${template.subject}"`);

        // Override subject if Parameter exists
        if (customSubject) {
            template.subject = customSubject;
        }

    } catch (e) {
        console.error('Failed to load template from Google Doc. Aborting.', e.message);
        log(`Error: Failed to load template: ${e.message}`);
        return;
    }

    // 3. Analyze Members (Pass 1)
    log('Fetching members...');
    const members = await sheets.getAllMembers();
    log(`Found ${members.length} members.`);

    const toSend = [];
    let skippedCount = 0;
    let registeredCount = 0;

    // Detailed Skip Counters
    let skippedAlreadyInvited = 0;
    let skippedWebsiteReg = 0;

    for (const member of members) {
        if (!member.email) continue;

        // Check if already registered
        if (member.registrationStatus && member.registrationStatus.trim().length > 0) {
            registeredCount++;
            continue;
        }

        // Check if Invitation already sent (unless Failed)
        if (member.token && member.token.trim().length > 0) {
            const status = member.token.trim().toLowerCase();
            if (!status.includes("failed")) {
                const isWebsite = status.includes("website");
                if (isWebsite) {
                    skippedWebsiteReg++;
                    // console.log(`[SKIP] ${member.email} - Already Registered via Website`);
                } else {
                    skippedAlreadyInvited++;
                }
                skippedCount++;
                continue;
            }
        }

        toSend.push(member);
    }

    // 4. Summary (Log Only)
    log('\n--- Summary ---');
    log(`Total Processed:    ${members.length}`);
    log(`Already Registered: ${registeredCount} (Column L is not empty)`);
    log(`Already Invited:    ${skippedAlreadyInvited} (Column M has token/sent status)`);
    log(`Website Reg (M):    ${skippedWebsiteReg} (Column M says 'Website')`);
    log(`Ready to Send:      ${toSend.length}`);

    if (toSend.length === 0) {
        log('No emails to send. Exiting.');
        return { success: true, sent: 0 };
    }

    // Confirmation Logic
    log(`[DEBUG] Check Confirm Key: '${preConfirmKey}'`);

    if (preConfirmKey !== 'nycbc') {
        log('\n[WAITING FOR CONFIRMATION]');
        log('Analysis complete. No emails sent yet.');
        return {
            success: false,
            waitingForConfirmation: true,
            stats: {
                total: members.length,
                registered: registeredCount,
                invited: skippedAlreadyInvited,
                website: skippedWebsiteReg,
                ready: toSend.length
            }
        };
    }

    // 5. Execution (Proceed)
    const MAX_BATCH_SIZE = 50;
    const batch = toSend.slice(0, MAX_BATCH_SIZE);

    log(`\nConfirmation accepted. Starting to send batch of ${batch.length} emails (Limit: ${MAX_BATCH_SIZE} per run)...`);
    log(`(Run this automation multiple times to process all ${toSend.length} pending candidates)`);

    let sentCount = 0;

    // Helper for Rate Limiting
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let lastError = null;

    for (const member of batch) {
        // Rate Limit: Wait 1.5 seconds between emails to avoid hitting Gmail/Sheet quotas
        await sleep(1500);

        // Generate Token
        const secret = process.env.JWT_SECRET || "fallback_secret_if_not_set";
        const token = jwt.sign({
            sub: member.email,
            breeze_id: member.breezeId,
            algorithm: "HS256",
            force_bmm_source: true
        }, secret, { expiresIn: '14d' });

        const link = `https://nycbc-connect.web.app/#/bmm?token=${token}`;

        // Substitutions
        let emailHtml = template.html;
        emailHtml = emailHtml.replace(/\{\{First Name\}\}/g, member.nickname || member.firstName || 'Member')
            .replace(/\{\{Last Name\}\}/g, member.lastName || '')
            // Old Placeholders (Legacy Support)
            .replace(/\{\{Zoom Meeting Title\}\}/g, bmmMeeting)
            .replace(/\{\{Zoom Meeting Date & Time\}\}/g, `${bmmDate} ${bmmTime}`)
            // New Placeholders (Sheet Based)
            .replace(/\{\{BMM Meeting\}\}/g, bmmMeeting)
            .replace(/\{\{BMM Date\}\}/g, bmmDate)
            .replace(/\{\{BMM Time\}\}/g, bmmTime);

        // Link Replacement
        const linkHtml = `<a href="${link}" style="display:inline-block;padding:10px 20px;background-color:#007bff;color:white;text-decoration:none;border-radius:5px;">Register Here / 按此報名</a><br><br>Or copy this link / 或複製此鏈接: ${link}`;
        const linkRegex = /(&lt;&lt;|<<)((<[^>]+>)|(\s+))*Hyperlink\s+here((<[^>]+>)|(\s+))*(&gt;&gt;|>>)/g;
        emailHtml = emailHtml.replace(linkRegex, linkHtml);

        const mailOptions = {
            from: {
                name: 'NYCBC BMM Registration',
                address: process.env.EMAIL_USER
            },
            to: member.email,
            subject: template.subject,
            html: emailHtml
        };

        try {
            await transporter.sendMail(mailOptions);
            log(`✅ Sent to ${member.email}`);

            const status = "Invitation Email Sent";
            try {
                if (member.breezeId) {
                    await sheets.updateTokenColumnByBreezeId(member.breezeId, status);
                } else {
                    await sheets.updateTokenColumn(member.email, status);
                }
            } catch (sheetErr) {
                console.error(`Sheet Update Failed for ${member.email}:`, sheetErr.message);
                // Don't fail the batch if sheet update fails, but log it.
            }
            sentCount++;
        } catch (error) {
            console.error(`❌ Failed to send to ${member.email}:`, error.message);
            log(`❌ Failed: ${member.email} - ${error.message}`);
            lastError = error.message;

            const status = "Invitation Email Failed";
            try {
                if (member.breezeId) {
                    await sheets.updateTokenColumnByBreezeId(member.breezeId, status);
                } else {
                    await sheets.updateTokenColumn(member.email, status);
                }
            } catch (e) { }
        }
    }

    log(`\nBatch Complete. Sent ${sentCount} emails.`);
    log(`Remaining pending emails: ${toSend.length - sentCount}. PLEASE RUN AGAIN.`);

    return {
        success: true,
        sent: sentCount,
        lastError: lastError,
        remaining: toSend.length - sentCount,
        stats: {
            total: members.length,
            registered: registeredCount,
            invited: skippedAlreadyInvited,
            website: skippedWebsiteReg,
            processedInJob: batch.length,
            pendingGlobal: toSend.length - batch.length
        }
    };
}


// Allow running directly via CLI
if (require.main === module) {
    sendInvitations().catch(console.error);
}

module.exports = { sendInvitations };
