@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Экспресс-агент — лента «на что ставить»
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  ОШИБКА: Node.js не установлен.
  echo  Скачайте с https://nodejs.org и установите.
  pause
  exit /b 1
)

set PORT=3006
echo  Останавливаем старый процесс на порту %PORT%...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
ping 127.0.0.1 -n 2 >nul
start "Экспресс-агент" /min cmd /c "set PORT=3006&& node server.mjs & pause"

echo  Прогрев ленты ~1-2 минуты — не закрывай окно сервера.
ping 127.0.0.1 -n 6 >nul

start "" "http://127.0.0.1:3006/"

echo.
echo  Открыто: http://127.0.0.1:3006/
echo  Смотри блок «Сейчас ставить» — там готовые сигналы.
echo  Закрыть: окно "Экспресс-агент" в панели задач.
echo.
pause
