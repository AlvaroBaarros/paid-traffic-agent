@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Paid Traffic Agent (beta)
echo.
echo   Paid Traffic Agent (beta)
echo   ----------------------------
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   O Node.js nao esta instalado.
  echo   Vou abrir a pagina de download: baixe a versao LTS, instale e abra este arquivo de novo.
  echo.
  start https://nodejs.org/pt-br/download
  pause
  exit /b
)
for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo   Seu Node.js e antigo. O Minerador precisa da versao 18 ou mais nova.
  start https://nodejs.org/pt-br/download
  pause
  exit /b
)
if not exist node_modules\chart.js (
  echo   Instalando o Minerador e o navegador do robo. So na primeira vez, alguns minutos...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   A instalacao falhou. Confira sua internet e tente de novo.
    pause
    exit /b
  )
)
node servidor.mjs
pause
