# NYCBC Automation

**NYCBC Automation** is a backend service providing automated data synchronization and task executions for the New York Chinese Baptist Church.

## Overview
This repository contains scripts and a Node.js web server that support automation flows, primarily focusing on:
- **IPASS Member Synchronization**: Automatically syncing member directory data (from Google Sheets or Breeze) into the local IPASS access control systems using headless browser automation (Puppeteer).
- **Communication & Notifications**: Automatically triggering status changes and confirmation emails to members via Nodemailer when their data is processed or synced successfully.
- **Background Jobs**: Checking Google Sheets and processing batch data updates securely.

## Built With
- **Node.js & Express**: Core server and task execution.
- **Puppeteer**: For headless browser automation on the local IPASS network.
- **Google APIs**: To securely read and write data to the Church Directory and application Google Sheets.
- **Nodemailer**: For sending automated SMTP emails.

## Quick Start
1. Clone this repository.
2. Run `npm install` to install all dependencies.
3. Configure your local `.env` and `service-account.json`. (See the Deployment/Run guides below for required variables).
4. Start the server:
   ```bash
   npm start
   ```

## Documentation
- **[LOCAL_RUN.md](LOCAL_RUN.md)**: Instructions on how to set up the automation locally.
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Guide on configuring the service for production and cloud deployment.
