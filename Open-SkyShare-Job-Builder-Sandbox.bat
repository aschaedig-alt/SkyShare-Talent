@echo off
cd /d "%~dp0"
set "APP_URL=http://127.0.0.1:3000/jobs-sandbox"

echo Opening SkyShare Job Post Builder sandbox preview...
echo.
echo This launcher uses Windows CMD only. No PowerShell is needed.
echo.

netstat -ano | find ":3000" | find "LISTENING" >nul
if errorlevel 1 (
  echo Starting local server in a separate window...
  start "SkyShare Job Builder Server" "%~dp0Run-SkyShare-Job-Builder-Server.cmd"
  echo Waiting for the server to get ready...
  call :wait_for_server
  if errorlevel 1 (
    echo The server is still starting. The page may need one refresh.
  ) else (
    echo Server is ready.
  )
) else (
  echo Local server is already running on port 3000.
)

call :open_url "%APP_URL%"

echo.
echo If the page opens before the server is ready, wait until the server window says Ready, then refresh.
pause
exit /b

:wait_for_server
set WAIT_COUNT=0
:wait_loop
netstat -ano | find ":3000" | find "LISTENING" >nul
if not errorlevel 1 exit /b 0
set /a WAIT_COUNT=WAIT_COUNT+1
if %WAIT_COUNT% GEQ 15 exit /b 1
timeout /t 2 /nobreak >nul
goto wait_loop

:open_url
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%~1"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%~1"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%~1"
) else (
  start "" "%~1"
)
exit /b
