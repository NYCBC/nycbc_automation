
require('dotenv').config();
const sheets = require('./src/sheets');

async function repairUser() {
    try {
        const targetEmail = 'wilsonchung35@yahoo.com';
        console.log(`Repairing data for: ${targetEmail}`);

        // 1. Get All Members (Fresh Profile Data)
        const members = await sheets.getAllMembers();
        const member = members.find(m => m.email.toLowerCase() === targetEmail.toLowerCase());

        if (!member) {
            console.error('Member not found in Profile Sheet!');
            return;
        }

        console.log('Found Fresh Member Data:', member);

        // 2. Get Current Token (to preserve it) - actually getAllMembers returns it
        const currentToken = member.token || 'temp-repair-token-' + Date.now();
        console.log('Current Token:', currentToken);

        // 3. Save Token (Triggers Data Update)
        const success = await sheets.saveToken(targetEmail, currentToken, member);

        if (success) {
            console.log('Successfully repaired user data in Registration Sheet.');
        } else {
            console.error('Failed to repair user data.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

repairUser();
