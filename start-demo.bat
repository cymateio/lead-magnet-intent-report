@echo off
REM ============================================================
REM  Cymate Signal Research Engine - demo launcher (Windows)
REM  Builds the app, starts the server on http://localhost:3000
REM  in a separate window, then opens a public Cloudflare tunnel.
REM  The public https://...trycloudflare.com URL prints below.
REM  Share that URL for the demo. Close both windows when done.
REM ============================================================

cd /d "%~dp0"

echo [1/3] Building...
call npm run build
if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )

echo [2/3] Starting engine on http://localhost:3000 ...
start "Cymate Engine" cmd /k "npm start"

echo Waiting for the server to boot...
timeout /t 5 /nobreak >nul

echo [3/3] Opening public tunnel. Your shareable URL appears below:
echo.
cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate
