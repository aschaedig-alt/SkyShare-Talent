@echo off
cd /d "%~dp0"

echo SkyShare Job Post Builder local server
echo.
echo Keep this window open while you use the app.
echo Main app:        http://127.0.0.1:3000/jobs
echo Sandbox preview: http://127.0.0.1:3000/jobs-sandbox
echo.

call "C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3000

echo.
echo The local server stopped. You can close this window.
pause
