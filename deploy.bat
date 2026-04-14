@echo off
cd /d %~dp0
echo ==========================================
echo   Church Zoom Automation - Deployment
echo ==========================================

echo [INFO] Deploying to Cloud Run (nycbc-automation)...
echo [INFO] Project: nycbc-connect (Reusing existing project)

call gcloud run deploy nycbc-automation --source . --region us-central1 --project nycbc-connect --allow-unauthenticated --timeout=3600 --env-vars-file cloud_run_prd.yaml

if %errorlevel% neq 0 (
    echo [ERROR] Deployment failed.
    pause
    exit /b 1
)

echo [INFO] Deployment Successful!
echo [INFO] Please update APP_BASE_URL in cloud_run_prd.yaml if the URL changed.
pause
