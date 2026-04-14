# Running Locally with Public Access (ngrok)

Since you are running this from your computer, you need a tool called **ngrok** to give you a public URL (like `https://Example.ngrok-free.app`) so that members can click the link in their email and reach your computer.

## Step 1: Install & Start ngrok
1.  Download ngrok from [ngrok.com/download](https://ngrok.com/download) (Windows).
2.  **Sign up for a free account** at [dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup).
3.  **Get your Authtoken** from [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
4.  Unzip ngrok and run `ngrok.exe`.
5.  **Authenticate** (run this once):
    ```bash
    ngrok config add-authtoken YOUR_TOKEN_HERE
    ```
6.  Now start the tunnel:
    ```bash
    ngrok http 3000
    ```
7.  Copy the **Forwarding** URL (looks like `https://a1b2-c3d4.ngrok-free.app`). **Keep this window open!**

## Step 2: Update Configuration
1.  Open your `.env` file in the project folder.
2.  Change `APP_BASE_URL` to your new ngrok URL:
    ```env
    APP_BASE_URL=https://your-ngrok-url.ngrok-free.app
    ```
    *(Do not add a trailing slash `/`)*

## Step 3: Start the Server
1.  Open a **new** terminal window (Command Prompt) in the project folder.
2.  Run:
    ```bash
    npm start
    ```
    You should see: `Server running at http://localhost:3000`

## Step 4: Send Invitations
1.  Open a **third** terminal window (or use the second one if you stop the server, but keep the server running!).
2.  Run the invitation script:
    ```bash
    node src/send-invites.js
    ```
    *   This will read the Sheet.
    *   Skip already registered users.
    *   Send emails with the correct `ngrok` link.

## Important Notes
*   **Don't close ngrok**: If you close it, the URL stops working.
*   **Don't close the server**: If you close `npm start`, the site goes down.
*   **Free Tier**: The ngrok URL changes every time you restart ngrok. If you restart it, you must update `.env` and re-send invites (or only send to new people).
