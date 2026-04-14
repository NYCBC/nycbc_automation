require('dotenv').config();
const axios = require('axios');

const BREEZE_API_KEY = '6f883eb05cd78aed73e23cf39ede6ad8';
const BASE_URL = 'https://nycbc.breezechms.com';
const FIELD_LICENSE_PLATE = '2143200740';

async function testFetch() {
    const breezeId = '14873312'; // The one that ran in the log
    console.log(`Fetching profile for ${breezeId}...`);
    
    try {
        const profileUrl = `${BASE_URL}/api/people/${breezeId}`;
        const profileResp = await axios.get(profileUrl, { headers: { 'Api-Key': BREEZE_API_KEY } });
        
        console.log("Details Object Keys:", Object.keys(profileResp.data.details));
        
        const lpField = Object.values(profileResp.data.details).find(d => d.field_id === FIELD_LICENSE_PLATE);
        if (lpField) {
            console.log("Raw License Plate Field Object:", JSON.stringify(lpField, null, 2));
            console.log("Value extracted:", lpField.value);
            const strVal = String(lpField.value).trim();
            console.log("String trimmed value:", `"${strVal}"`);
        } else {
            console.log("License Plate field not found in profile details!!!");
            // Print full details to find it
            console.log(JSON.stringify(profileResp.data.details, null, 2));
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}

testFetch();
