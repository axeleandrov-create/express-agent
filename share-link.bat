@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=3006

echo.
echo  === Облачная ссылка для телефона ===
echo.
echo  1. Сервер должен работать (start.bat)
echo  2. Ниже появится ссылка https://....loca.lt
echo  3. Открой в Safari на телефоне
echo  4. Если спросит пароль туннеля — введи IP с https://ifconfig.me на этом ПК
echo  5. Не закрывай это окно
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  ОШИБКА: Node.js не установлен.
  pause
  exit /b 1
)

where cloudflared >nul 2>&1
if not errorlevel 1 (
  echo  Cloudflare Tunnel...
  cloudflared tunnel --url http://127.0.0.1:%PORT%
  pause
  exit /b 0
)

if exist "%~dp0cloudflared.exe" (
  echo  Cloudflare Tunnel...
  "%~dp0cloudflared.exe" tunnel --url http://127.0.0.1:%PORT%
  pause
  exit /b 0
)

echo  Localtunnel (облако)...
npx --yes localtunnel --port %PORT%
pause
