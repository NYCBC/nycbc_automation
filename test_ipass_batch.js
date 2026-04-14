const { getPendingIpassBatchRecords } = require('./src/ipass_batch');
require('dotenv').config();

console.log("Testing batch record extraction...");
getPendingIpassBatchRecords().then(rows => {
    console.log(`Found ${rows.length} pending records.`);
    console.log(JSON.stringify(rows, null, 2));
}).catch(console.error);
