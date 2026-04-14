const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();

const BREEZE_API_KEY = '6f883eb05cd78aed73e23cf39ede6ad8'; // User provided this directly for the script
const BASE_URL = 'https://nycbc.breezechms.com';

// Breeze Field IDs
const FIELD_LICENSE_PLATE = '2143200740';
const FIELD_PARKING_ACTIVE = '2143200741';
const FIELD_PARKING_EXPIRY = '2143206175';
const FIELD_APPLICATION_DATE = '2143203653';

// Configure Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // Assuming NYCBC uses Google Workspace based on previous context
    auth: {
        user: process.env.EMAIL_USER || 'facility.admin@nycbc.ca', // Ensure it uses the requested sender
        pass: process.env.EMAIL_PASS // Depends on .env
    }
});

async function updateBreezeAndEmail(entryData, logCallback = console.log) {
    let result = { breezeSuccess: false, emailSuccess: false, message: '' };

    try {
        const { breezeId, plate, isActive, expiry, name, email } = entryData;

        // 1. Update Breeze
        if (!breezeId) {
            result.message = 'No Breeze ID provided.';
            return result;
        }

        logCallback(`      -> Fetching existing Breeze profile for ID ${breezeId} to check for plate changes...`);
        const profileUrl = `${BASE_URL}/api/people/${breezeId}`;
        let oldPlate = '';
        try {
            const profileResp = await axios.get(profileUrl, { headers: { 'Api-Key': BREEZE_API_KEY } });
            if (profileResp.status === 200 && profileResp.data && profileResp.data.details) {
                // The details object uses field_ids as keys
                const lpValue = profileResp.data.details[FIELD_LICENSE_PLATE];
                if (lpValue) {
                    oldPlate = String(lpValue).trim();
                }
            }
        } catch (fetchErr) {
            logCallback(`      -> [DEBUG] Could not fetch old plate: ${fetchErr.message}`);
        }

        const newPlate = (plate || '').trim();
        let plateChangedNote = '';
        
        // If they had an old plate, and it's different from the new one, add the note.
        if (oldPlate && newPlate && oldPlate.toLowerCase() !== newPlate.toLowerCase()) {
            plateChangedNote = `<p style="color: #555;"><i>Note: Your license plate <b>${oldPlate}</b> has been removed from the church system and replaced with <b>${newPlate}</b>.</i></p>`;
        }


        const fields = [];
        fields.push({ field_id: FIELD_LICENSE_PLATE, field_type: "text", response: newPlate });

        // Use Option ID "2019" for "Yes". If inactive, we send empty string to uncheck.
        fields.push({ field_id: FIELD_PARKING_ACTIVE, field_type: "checkbox", response: isActive ? "2019" : "" });

        if (expiry) {
            fields.push({ field_id: FIELD_PARKING_EXPIRY, field_type: "date", response: expiry });
        }

        // Add Application Date as today's date
        if (isActive) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            fields.push({ field_id: FIELD_APPLICATION_DATE, field_type: "date", response: `${yyyy}-${mm}-${dd}` });
        }

        const url = `${BASE_URL}/api/people/update?person_id=${breezeId}&fields_json=${encodeURIComponent(JSON.stringify(fields))}`;

        logCallback(`      -> Updating Breeze API for ID ${breezeId}...`);
        const breezeResp = await axios.get(url, { headers: { 'Api-Key': BREEZE_API_KEY } });

        if (breezeResp.status === 200) {
            result.breezeSuccess = true;
            logCallback(`      -> ✅ Breeze Update Successful.`);

            // 2. Send Email
            if (email) {
                logCallback(`      -> Sending Confirmation Email to ${email}...`);
                const htmlBody = `
                    <div style="font-family: sans-serif; font-size: 14px;">
                        <p>Hi ${name || 'there'},</p>
                        <p>Your parking permit information has been updated:</p>
                        <ul>
                            <li><b>Status:</b> ${isActive ? "Active" : "Inactive"}</li>
                            <li><b>License Plate:</b> ${newPlate || "N/A"}</li>
                            <li><b>Expiry Date:</b> ${expiry || "N/A"}</li>
                        </ul>
                        ${plateChangedNote}
                        <p>Blessings,<br>NYCBC Office</p>
                    </div>`;

                try {
                    await transporter.sendMail({
                        from: `"NYCBC Office" <${process.env.EMAIL_USER || 'facility.admin@nycbc.ca'}>`,
                        to: email,
                        subject: "NYCBC Parking Permit – Confirmation",
                        html: htmlBody
                    });
                    result.emailSuccess = true;
                    logCallback(`      -> ✅ Email Sent successfully.`);
                    result.message = 'Breeze Updated & Email Sent';
                } catch (emailErr) {
                    logCallback(`      -> ❌ Email Failed: ${emailErr.message}`);
                    result.message = `Breeze Updated but Email Failed: ${emailErr.message}`;
                }
            } else {
                logCallback(`      -> ⚠️ No Email Address to send confirmation to.`);
                result.message = 'Breeze Updated (No Email Sent)';
                result.emailSuccess = true; // functionally successful if no email exists
            }

        } else {
            logCallback(`      -> ❌ Breeze Update Failed: ${breezeResp.statusText}`);
            result.message = `Breeze Update Error: ${breezeResp.statusText}`;
        }

    } catch (err) {
        logCallback(`      -> ❌ System Error during Breeze/Email logic: ${err.message}`);
        result.message = `System Error: ${err.message}`;
    }

    return result;
}

module.exports = {
    updateBreezeAndEmail
};
