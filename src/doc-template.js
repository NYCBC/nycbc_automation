const { google } = require('googleapis');
const fs = require('fs');

const juice = require('juice');

class DocTemplateService {
    constructor() {
        // Support loading credentials from ENV (for deployment) or File (local)
        // Reusing the logic from sheets.js for consistency
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

        const authConfig = {
            scopes: [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/documents.readonly'
            ],
        };

        if (credentialsJson) {
            try {
                authConfig.credentials = JSON.parse(credentialsJson);
            } catch (e) {
                console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON', e);
            }
        } else {
            // Check if file exists to avoid immediate crash if not set up
            if (fs.existsSync('./service-account.json')) {
                authConfig.keyFile = './service-account.json';
            }
        }

        this.auth = new google.auth.GoogleAuth(authConfig);
        this.drive = google.drive({ version: 'v3', auth: this.auth });
        this.docs = google.docs({ version: 'v1', auth: this.auth });
    }

    /**
     * Fetches the document title and content as HTML.
     * @param {string} fileId The Google Doc ID
     * @returns {Promise<{subject: string, html: string}>}
     */
    async getTemplate(fileId) {
        try {
            // 1. Get the file metadata to use as Subject
            const fileMetadata = await this.drive.files.get({
                fileId: fileId,
                fields: 'name',
                supportsAllDrives: true
            });
            const subject = fileMetadata.data.name;

            // 2. Export the file content as HTML
            // drive.files.export converts Google Docs to other formats
            const exportResponse = await this.drive.files.export({
                fileId: fileId,
                mimeType: 'text/html'
            });

            // The export result is in data
            let html = exportResponse.data;

            // Debug Logging for Type Safety
            if (typeof html !== 'string') {
                console.warn(`Warning: Google Doc export returned type '${typeof html}'. Expected string.`);
                if (Buffer.isBuffer(html)) {
                    html = html.toString('utf8');
                } else if (typeof html === 'object') {
                    // Try converting to string if possible, or empty
                    html = JSON.stringify(html);
                } else if (!html) {
                    html = "";
                }
            }

            if (!html) {
                console.warn("Warning: Exported HTML is empty.");
                html = "";
            }

            // 3. Inline CSS for Email Compatibility
            // Google Docs HTML puts everything in <style> classes.
            // Emails (especially Gmail) strip <style> blocks.
            // "juice" moves these styles inline to style="..." attributes.
            let inlinedHtml = "";

            // Ensure html is fundamentally a string before passing to juice
            if (html === undefined || html === null) {
                html = "";
            }

            // Debug Logging: Log the start of the HTML to verify structure
            console.log("DEBUG: HTML Snippet (first 500 chars):", html.substring(0, 500));

            // [FIX 2] Hard-replace List Tags with Inline Styles
            // Regex replacement ensures styles are applied even if Juice fails or if matching rules are weak.
            html = html.replace(/<ul\b[^>]*>/gi, '<ul style="list-style-type: disc !important; margin-left: 20px !important; padding-left: 20px !important;">')
                .replace(/<li\b[^>]*>/gi, '<li style="display: list-item !important; margin-bottom: 5px;">')
                .replace(/<ol\b[^>]*>/gi, '<ol style="list-style-type: decimal !important; margin-left: 20px !important; padding-left: 20px !important;">');

            // [FIX 1] Inject Explicit List Styling for Email Clients (Backup for Juice)
            const listStyles = `
            <style>
                ul { list-style-type: disc !important; margin-left: 20px !important; padding-left: 20px !important; }
                li { display: list-item !important; }
            </style>
            `;
            html = listStyles + html;

            try {
                inlinedHtml = juice(html);
            } catch (juiceErr) {
                console.error("Juice HTML inlining failed:", juiceErr.message);
                console.warn("Falling back to raw HTML (formatting might be lost in email).");
                inlinedHtml = html;
            }

            return { subject, html: inlinedHtml };

        } catch (error) {
            console.error(`Error fetching template for ID ${fileId}:`, error.message);
            throw error;
        }
    }
}

module.exports = new DocTemplateService();
