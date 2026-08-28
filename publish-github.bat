@echo off
chcp 65001 >nul
set SRC=%~dp0
set TMP=%TEMP%\express-agent-github

echo.
echo  === Публикация на GitHub ===
echo.

where gh >nul 2>&1
if errorlevel 1 (
  echo  Скачай GitHub CLI: https://cli.github.com
  pause
  exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo  Сначала войди в GitHub:
  gh auth login
  echo.
)

set /p REPO="Имя репозитория (Enter = express-agent): "
if "%REPO%"=="" set REPO=express-agent

echo.
echo  Копирую проект...
if exist "%TMP%" rmdir /s /q "%TMP%"
mkdir "%TMP%"
robocopy "%SRC%" "%TMP%" /E /XD node_modules cache data .git /XF *.log *.sqlite *.sqlite-* .env .env.local >nul

cd /d "%TMP%"
git init -b main
git add -A
git commit -m "express-agent — публикация на GitHub"

echo  Создаю репозиторий на GitHub...
gh repo create %REPO% --public --source=. --remote=origin --push

if errorlevel 1 (
  echo.
  echo  Не вышло. Возможно имя занято — выбери другое.
  pause
  exit /b 1
)

for /f "delims=" %%u in ('gh repo view --json url -q .url') do set REPO_URL=%%u
echo.
echo  === Готово ===
echo  GitHub: %REPO_URL%
echo.
echo  Чтобы сайт открывался на телефоне:
echo  1. https://dashboard.render.com/select-repo?type=blueprint
echo  2. Выбери репозиторий %REPO%
echo  3. Deploy — получишь ссылку https://....onrender.com
echo.
pause
