@echo off
rem Double-click to start the Blockscape server.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is needed: https://nodejs.org & pause & exit /b 1)
node server.js %*
pause
