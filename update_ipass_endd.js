const fs = require('fs');

let code = fs.readFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', 'utf8');

// There's a logCallback in the current source code that my hardcoded string was missing.
const hasEndDRegex = /if \(hasEndD\) \{\s*await page\.click\('#EndD', \{ clickCount: 3 \}\);\s*await page\.keyboard\.press\('Backspace'\);\s*await page\.type\('#EndD', formattedExpiry\);\s*await page\.evaluate\(\(\) => document\.querySelector\('#EndD'\)\.dispatchEvent\(new Event\('change'\)\)\);\s*await waitForAjax\(\);\s*\}/;

const newHasEndDLogic = `if (hasEndD) {
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
                        }`;

if (hasEndDRegex.test(code)) {
    code = code.replace(hasEndDRegex, newHasEndDLogic);
    fs.writeFileSync('C:/Users/wilso/.gemini/antigravity/scratch/nycbc_automation/src/ipass.js', code);
    console.log("Successfully replaced EndD logic via regex");
} else {
    console.log("Could not find the exact hasEndD block via regex.");
}
