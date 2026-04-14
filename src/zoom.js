const axios = require('axios');

class ZoomClient {
    constructor() {
        this.accountId = process.env.ZOOM_ACCOUNT_ID;
        this.clientId = process.env.ZOOM_CLIENT_ID;
        this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
        this.accessToken = null;
        this.tokenExpiresAt = 0;
    }

    async getAccessToken() {
        // Reuse token if valid (buffer of 5 minutes)
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
            return this.accessToken;
        }

        try {
            const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            const response = await axios.post('https://zoom.us/oauth/token', null, {
                params: {
                    grant_type: 'account_credentials',
                    account_id: this.accountId
                },
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            });

            this.accessToken = response.data.access_token;
            // Set expiration (expires_in is usually 3600 seconds)
            this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
            return this.accessToken;
        } catch (error) {
            console.error('Error getting Zoom Access Token:', error.response?.data || error.message);
            throw error;
        }
    }

    async addRegistrant(meetingId, email, firstName, lastName) {
        try {
            const token = await this.getAccessToken();

            // https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingRegistrantCreate
            const response = await axios.post(
                `https://api.zoom.us/v2/meetings/${meetingId}/registrants`,
                {
                    email: email,
                    first_name: firstName,
                    last_name: lastName,
                    auto_approve: true // Approve immediately
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            // Check if user is already registered
            if (error.response?.data?.code === 3001) { // Meeting Registrant exist
                return { status: 'already_registered' };
            }
            console.error(`Failed to register ${email}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getMeetingDetails(meetingId) {
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(
                `https://api.zoom.us/v2/meetings/${meetingId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Failed to get meeting details for ${meetingId}:`, error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new ZoomClient();
