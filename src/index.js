require('dotenv').config();
const sheets = require('./sheets');
const zoom = require('./zoom');

async function main() {
    const ZOOM_MEETING_ID = process.env.ZOOM_MEETING_ID;

    if (!ZOOM_MEETING_ID) {
        console.error('Please set ZOOM_MEETING_ID in .env');
        return;
    }
    if (!process.env.GOOGLE_SHEET_ID) {
        console.error('Please set GOOGLE_SHEET_ID in .env');
        return;
    }

    console.log('Reading Google Sheet...');
    try {
        const members = await sheets.getRows();
        console.log(`Found ${members.length} rows with email addresses.`);

        for (const member of members) {
            // Check if already registered
            if (member.registrationStatus && member.registrationStatus.toLowerCase() === 'registered') {
                continue;
            }

            console.log(`Registering ${member.firstName} ${member.lastName} (${member.email})...`);

            try {
                const result = await zoom.addRegistrant(
                    ZOOM_MEETING_ID,
                    member.email,
                    member.firstName,
                    member.lastName
                );

                if (result.join_url || result.registrant_id || result.status === 'already_registered') {
                    console.log(`Success: ${member.email}`);
                    await sheets.updateRowStatus(member.sheetRowNumber, 'Registered');
                } else {
                    console.error(`Unexpected Zoom response for ${member.email}`, result);
                }

            } catch (err) {
                console.error(`Failed to register ${member.email}`);
                // Continue to next member even if one fails
            }
        }

        console.log('Done processing.');

    } catch (error) {
        if (error.message.includes('permission') || (error.response && error.response.status === 403)) {
            const serviceAccount = require('../service-account.json');
            console.error('\n\n================================================================================');
            console.error('                           ACCESS DENIED');
            console.error('================================================================================');
            console.error('The automation cannot access the Google Sheet yet.');
            console.error('Please share the sheet with the following email address:\n');
            console.error(`👉  ${serviceAccount.client_email}  👈\n`);
            console.error('1. Open your Google Sheet.');
            console.error('2. Click "Share" (top right).');
            console.error('3. Paste the email above.');
            console.error('4. Initial "Editor" access.');
            console.error('================================================================================\n');
        } else {
            console.error('Fatal error:', error.message, error.response?.data || '');
        }
    }
}

main();
