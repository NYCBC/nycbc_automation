require('dotenv').config();
const sheets = require('./src/sheets');

async function test() {
    process.env.GOOGLE_SHEET_ID = '1fj2dLBJX_5lzZUEoNl2PeH5B79YlxzNmIYd027uS_A4';
    const params = await sheets.getParameters();
    console.log("params:", params);

    const members = await sheets.getAllMembers();
    console.log(`Found ${members.length} members.`);
    console.log(members);
}

test();
