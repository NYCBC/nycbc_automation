const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
require('dotenv').config();

async function testDateLogic() {
    let browser = null;
    try {
        console.log(`Launching headless browser...`);
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            headless: false // Show the browser
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`Navigating to IPASS...`);
        page.goto('https://ipass.preciserd.com/v2/', { timeout: 60000 }).catch(e => {
            console.log(`[DEBUG] page.goto warning: ${e.message}`);
        });

        console.log(`Switching to Validation tab...`);
        await page.waitForSelector('#validation-form-link', { visible: true, timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));
        await page.click('#validation-form-link');

        await page.evaluate(() => {
            document.getElementById('LoginType').value = '2';
        });

        await new Promise(r => setTimeout(r, 500));

        console.log(`Logging in...`);
        await page.waitForSelector('#UserName', { visible: true });

        // Use environment variables or hardcoded test values
        const ipassUser = process.env.IPASS_USER || 'scheng';
        const ipassPass = process.env.IPASS_PASS || 'scheng';

        await page.click('#UserName', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#UserName', ipassUser);

        await page.click('#Password', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#Password', ipassPass);

        console.log(`Submitting login form...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log(`[DEBUG] Navigation timeout after login: ${e.message}`)),
            page.evaluate(() => {
                const btn = document.getElementById('login-submit');
                if (btn) btn.click();
                else document.getElementById('login-form').submit();
            })
        ]);

        console.log(`Wait over. Checking for mainPageContent...`);
        await page.waitForSelector('.mainPageContent', { visible: true, timeout: 15000 });

        console.log(`Login successful. Current URL: ${page.url()}`);

        const waitForAjax = async (timeoutMs = 15000) => {
            await new Promise(r => setTimeout(r, 500));
            try {
                await page.waitForFunction(() => {
                    const loader = document.getElementById('loader_panel');
                    return !loader || window.getComputedStyle(loader).display === 'none';
                }, { timeout: timeoutMs });
            } catch (e) {
                console.log(`[DEBUG] Timeout waiting for AJAX loader`);
            }
            await new Promise(r => setTimeout(r, 500));
        };

        await waitForAjax();

        console.log('Testing Expiry date logic...');
        const formattedExpiry = '12/31/2026'; // MM/DD/YYYY
        console.log(`Setting Expiry Date to ${formattedExpiry}...`);

        const hasEndToggle = await page.$('#EndTimeChoose');
        if (hasEndToggle) {
            const isChecked = await page.$eval('#EndTimeChoose', el => el.checked);
            if (!isChecked) {
                console.log('Clicking EndTimeChoose checkbox');
                await page.evaluate(() => {
                    const el = document.getElementById('EndTimeChoose');
                    if (el) { el.click(); }
                });
                await waitForAjax();
            }

            const hasEndD = await page.$('#EndD');
            console.log('EndD input exists:', !!hasEndD);
            if (hasEndD) {
                console.log('Using jQuery datepicker to set date explicitly...');

                await page.evaluate((dateStr) => {
                    // The site uses jQuery UI datepicker. Typing triggers change events that recalculate 1 day from Start.
                    // We must tell the datepicker plugin directly to bypass the typed input restrictions.
                    if (window.$ && window.$('#EndD').length) {
                        window.$('#EndD').datepicker('setDate', dateStr);
                        // Trigger change so site's other scripts pick up the new date to calculate duration
                        window.$('#EndD').trigger('change');
                    } else {
                        // Fallback
                        document.getElementById('EndD').value = dateStr;
                        document.getElementById('EndD').dispatchEvent(new Event('change'));
                    }
                }, formattedExpiry);

                await waitForAjax();

                // Read it back
                const val = await page.$eval('#EndD', el => el.value);
                console.log('Value of EndD after setting:', val);

                const expLabel = await page.$eval('#ExpirationTime', el => el.innerText);
                console.log('Value of ExpirationTime label:', expLabel);
            }
        }

        await new Promise(r => setTimeout(r, 10000)); // Keep browser open for a bit
        console.log('Done testing.');

    } catch (e) {
        console.log(`FATAL ERROR: ${e.message}`);
    } finally {
        if (browser) {
            console.log(`Closing browser...`);
            await browser.close();
        }
    }
}

testDateLogic();
