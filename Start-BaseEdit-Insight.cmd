@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   BaseEdit Insight - Client Launcher
echo ============================================
echo.

netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo BaseEdit Insight is already running.
  echo Opening http://localhost:3000 ...
  start "" http://localhost:3000
  exit /b 0
)

if not exist ".next\BUILD_ID" (
  echo First run: building the client...
  call npm run build
  if errorlevel 1 (
    echo.
    echo Build failed. Please check the error above.
    pause
    exit /b 1
  )
)

echo Starting web client and background worker...
start "BaseEdit Insight - Web" cmd /k "npm start"
start "BaseEdit Insight - Worker" cmd /k "npm run worker"

echo Waiting for the server to become ready...
set /a tries=0
:wait
timeout /t 2 /nobreak >nul
set /a tries+=1
curl -s -o nul http://localhost:3000/api/health
if %errorlevel%==0 goto open
if %tries% GEQ 15 goto open
goto wait

:open
echo.
echo Client is ready: http://localhost:3000
start "" http://localhost:3000
exit /b 0
