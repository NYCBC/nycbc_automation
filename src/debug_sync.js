const sheets = require('./sheets');

async function debugSync() {
    console.log('--- Debugging BMM Sync ---');

    // 1. Check Parameters
    console.log('1. Fetching Parameters...');
    const params = await sheets.getParameters();
    console.log('Parameters Found:', params);

    const targetId = params['BMM Support Sheet ID'];
    if (!targetId) {
        console.error('CRITICAL: "BMM Support Sheet ID" not found in Parameters!');
        return;
    }
    console.log(`Target Sheet ID: ${targetId}`);

    // 2. Try to sync Row 2 (assuming it exists as test)
    console.log('2. Attempting to copy Row 2...');
    try {
        const result = await sheets.copyRowToSupportSheet(2, targetId);
        console.log('Copy Result:', result);
    } catch (e) {
        console.error('Copy Failed:', e);
    }
}

debugSync();
