@echo off
setlocal
cd /d "%~dp0"

echo Stopping BaseEdit Insight web server...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)

echo Stopping BaseEdit Insight worker...
node -e "try{const D=require('better-sqlite3');const db=new D('data/baseedit.db',{readonly:true});const r=db.prepare('select pid from worker_heartbeats order by last_seen desc limit 1').get();if(r&&r.pid){require('child_process').execSync('taskkill /PID '+r.pid+' /F',{stdio:'ignore'});console.log('Worker stopped (PID '+r.pid+')')}else{console.log('No worker PID found')}}catch(e){console.log('Worker was not running')}"

echo.
echo BaseEdit Insight stopped.
timeout /t 2 /nobreak >nul
exit /b 0
