# Deployment Guide

We recommend **Render.com** or **Railway.app** as they are easy to set up for Node.js apps and have free tiers/trials.

## Option 1: Deploy to Render (Recommended)

1.  **Push your code to GitHub** (or GitLab/Bitbucket).
    *   Make sure you do NOT upload `.env` or `service-account.json`.

2.  **Create a New Web Service** on Render.
    *   Connect your GitHub repository.
    *   **Build Command**: `npm install`
    *   **Start Command**: `node src/server.js`

3.  **Ad Environment Variables**:
    *   Go to the **Environment** tab in Render.
    *   Add each key-value pair from your local `.env` file:
        *   `ZOOM_ACCOUNT_ID`
        *   `ZOOM_CLIENT_ID`
        *   `ZOOM_CLIENT_SECRET`
        *   `GOOGLE_SHEET_ID`
        *   `ZOOM_MEETING_ID`
        *   `EMAIL_USER`
        *   `EMAIL_PASS`
    
4.  **Special Handling for `service-account.json`**:
    *   Since we can't upload the JSON file, we usually put the *contents* of the JSON file into a single environment variable (e.g., `GOOGLE_CREDENTIALS_JSON`) or base64 encode it.
    *   **Easier Fix for now**: COPY the contents of `service-account.json` and paste it into a file on the server? No, Render doesn't let you edit files.
    *   **Best Practice**:
        1.  Create an environment variable `GOOGLE_SERVICE_ACCOUNT_JSON` and paste the *entire content* of the json file as the value.
        2.  Update `src/sheets.js` to look for this variable if the file defaults aren't found, OR write a small script to create the file from the variable on start.
        
        *Script to create key file on start (add this to package.json scripts or run before start)*:
        `echo $GOOGLE_SERVICE_ACCOUNT_JSON > service-account.json`

## Option 2: Run Locally (Tunneling)
If needed for just one event, you can use **ngrok** to expose your local port 3000 to the world.
1. Install ngrok.
2. Run `ngrok http 3000`.
3. Use the `https://....ngrok-free.app` URL as your `APP_BASE_URL`.
