@echo off
title ACCESSIA Pro — Dev
setlocal

echo.
echo  ACCESSIA Pro — Mode Developpement
echo  ══════════════════════════════════
echo.

:: ── Chemins ────────────────────────────────────────────────────────────────
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "PYTHON310=C:\Users\qeved\AppData\Local\Programs\Python\Python310\python.exe"
set "VENV_PYTHON=%BACKEND%\venv\Scripts\python.exe"

:: ── Tuer les anciens processus sur 8000 et 3001 ────────────────────────────
echo [0/4] Nettoyage des anciens processus...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Backend : venv ──────────────────────────────────────────────────────────
echo [1/4] Verification du venv Python...
cd /d "%BACKEND%"

if not exist venv (
    echo      Creation du venv avec Python 3.10...
    if exist "%PYTHON310%" (
        "%PYTHON310%" -m venv venv
    ) else (
        python -m venv venv
    )
)

:: Verifier que pip est disponible dans le venv
"%VENV_PYTHON%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo      Venv corrompu - recreation...
    rmdir /s /q venv >nul 2>&1
    if exist "%PYTHON310%" (
        "%PYTHON310%" -m venv venv
    ) else (
        python -m venv venv
    )
)

echo [2/4] Installation des dependances Python...
"%VENV_PYTHON%" -m pip install -r requirements.txt -q --disable-pip-version-check 2>nul

:: ── Backend : demarrage ─────────────────────────────────────────────────────
echo [3/4] Demarrage du backend FastAPI (port 8000)...
start "ACCESSIA Backend" cmd /k "cd /d "%BACKEND%" && "%VENV_PYTHON%" -m uvicorn main:app --reload --port 8000"

:: Attendre que le backend soit pret (max 15 secondes)
set /a tries=0
:wait_backend
timeout /t 2 /nobreak >nul
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 (
    set /a tries+=1
    if %tries% lss 7 goto wait_backend
    echo      [ATTENTION] Backend lent a demarrer, continuons...
) else (
    echo      Backend pret !
)

:: ── Frontend : demarrage ────────────────────────────────────────────────────
cd /d "%FRONTEND%"
if not exist node_modules (
    echo      Installation des dependances npm (premiere fois)...
    npm install --legacy-peer-deps
)
start "ACCESSIA Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

:: ── Done ───────────────────────────────────────────────────────────────────
echo.
echo ══════════════════════════════════
echo  ACCESSIA Pro en cours de demarrage
echo.
echo   Application  : http://localhost:3001
echo   API Swagger  : http://localhost:8000/docs
echo ══════════════════════════════════
echo.
timeout /t 6 /nobreak >nul
start http://localhost:3001
endlocal
