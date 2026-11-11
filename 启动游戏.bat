@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 还没有安装 Node.js，请先到 https://nodejs.org 下载安装 LTS 版本 & start https://nodejs.org & pause & exit /b)
if not exist node_modules call npm install --omit=dev
start "" http://localhost:3000
npm start
pause
