# Deploying to Render.com

This guide will walk you through deploying your Church Zoom Automation app to Render.

## Prerequisites
1.  **Git Installed**: Download and install [Git for Windows](https://git-scm.com/download/win).
2.  **GitHub Account**: You must have a GitHub account.
3.  **Render Account**: Sign up at [render.com](https://render.com) using your GitHub account.

## Step 1: Push Code to GitHub
Since I cannot push code for you, you need to do this step.

1.  **Create a New Repository** on GitHub.
    *   Name it something like `church-zoom-automation`.
    *   Make it **Private** (recommended since it's for church use).
    *   **Do not** initialize with a README, .gitignore, or License (we already have them).

2.  **Push your code**:
    Open a terminal in this folder (`c:\Users\User\.gemini\antigravity\scratch\church-zoom-automation`) and run:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/church-zoom-automation.git
    git branch -M main
    git push -u origin main
    ```
    *(Replace `YOUR_USERNAME` with your actual GitHub username)*

## Step 2: Create Web Service on Render

1.  Go to your [Render Dashboard](https://dashboard.render.com).
2.  Click **New +** and select **Web Service**.
3.  Connect your GitHub account if prompted.
4.  Find your `church-zoom-automation` repo and click **Connect**.
5.  **Configure the Service**:
    *   **Name**: `church-zoom-automation` (or whatever you like)
    *   **Region**: Closest to you (e.g., Ohio, Oregon, Frankfurt)
    *   **Branch**: `main`
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node src/server.js`
    *   **Plan**: `Free`

## Step 3: Configure Environment Variables

**Crucial Step**: Your app needs secrets to work.

1.  Scroll down to the **Environment Variables** section (or set them later in the "Environment" tab).
2.  Add the following keys and values (copy from your local `.env` file):

    | Key | Value |
    | :--- | :--- |
    | `ZOOM_ACCOUNT_ID` | *(Copy from .env)* |
    | `ZOOM_CLIENT_ID` | *(Copy from .env)* |
    | `ZOOM_CLIENT_SECRET` | *(Copy from .env)* |
    | `GOOGLE_SHEET_ID` | *(Copy from .env)* |
    | `ZOOM_MEETING_ID` | *(Copy from .env)* |
    | `EMAIL_USER` | *(Copy from .env)* |
    | `EMAIL_PASS` | *(Copy from .env)* |
    | `ADMIN_SECRET` | *(Create a strong password here, e.g., `MySuperSecretKey123`)* |

3.  **Google Credentials (Special)**:
    Since we cannot upload `service-account.json`, we use a special variable.
    *   **Key**: `GOOGLE_SERVICE_ACCOUNT_JSON`
    *   **Value**: Open your local `service-account.json` file, **copy the entire content**, and paste it into this value field.

## Step 4: Deploy & Verify

1.  Click **Create Web Service**.
2.  Render will start building your app. It might take a minute or two.
3.  Once it says **Live**, you will see a URL (like `https://church-zoom-automation.onrender.com`).

### Verify the App
1.  **Test the Web Trigger**:
    Visit: `https://YOUR-APP-URL.onrender.com/api/admin/trigger-invites?key=YOUR_ADMIN_SECRET`
    *   You should see a JSON response saying `success: true`.

2.  **Test Registration**:
    *   Use the Registration Link (if you have the frontend set up) or call the API directly.
    *   Ensure the Zoom registration works and updates the Google Sheet.
