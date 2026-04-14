require('dotenv').config();
const { runIpassSync } = require('./src/ipass');

async function test() {
    console.log("Starting manual test run of IPASS sync...");
    
    // Pass a simple console.log wrapper to print to terminal
    const results = await runIpassSync((msg) => {
        console.log(`[LOG] ${msg}`);
    });
    
    console.log("Test finished with results:");
    console.log(JSON.stringify(results, null, 2));
}

test().catch(err => {
    console.error("Test failed with error:", err);
});
