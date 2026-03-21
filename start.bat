@echo off
title ACCESSIA Pro — Production
setlocal

echo.
echo  ACCESSIA Pro — Mode Production (local)
echo  ═══════════════════════════════════════
echo.

:: ── Chemins ────────────────────────────────────────────────────────────────
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV_PYTHON=%BACKEND%\venv\Scripts\python.exe"
set "PYTHON_CMD="

:: ── Tuer les anciens processus ──────────────────────────────────────────────
echo [0/4] Nettoyage...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Venv Python ─────────────────────────────────────────────────────────────
echo [1/4] Verification du venv Python...
cd /d "%BACKEND%"
call :resolve_python
if errorlevel 1 goto :python_not_found
if not exist venv (
    call :create_venv
    if errorlevel 1 goto :python_not_found
)
"%VENV_PYTHON%" -m pip --version >nul 2>&1
if errorlevel 1 (
    rmdir /s /q venv >nul 2>&1
    call :create_venv
    if errorlevel 1 goto :python_not_found
)
"%VENV_PYTHON%" -m pip install -r requirements.txt -q --disable-pip-version-check 2>nul

:: ── Backend production (sans --reload) ──────────────────────────────────────
echo [2/4] Demarrage du backend (production)...
start "ACCESSIA Backend" cmd /k "cd /d "%BACKEND%" && "%VENV_PYTHON%" -m uvicorn main:app --port 8000 --workers 2"

set /a tries=0
:wait_backend
timeout /t 2 /nobreak >nul
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 (
    set /a tries+=1
    if %tries% lss 10 goto wait_backend
    echo [ATTENTION] Backend lent a demarrer...
) else (
    echo      Backend pret !
)

:: ── Frontend : build si necessaire ──────────────────────────────────────────
echo [3/4] Verification du build frontend...
cd /d "%FRONTEND%"
if not exist node_modules (
    echo      Installation npm...
    npm install --legacy-peer-deps
)
if not exist .next\BUILD_ID (
    echo      Build de production en cours (premiere fois, ~1 min)...
    npm run build
)

:: ── Frontend production (next start) ────────────────────────────────────────
echo [4/4] Demarrage du frontend (production)...
start "ACCESSIA Frontend" cmd /k "cd /d "%FRONTEND%" && npm start"

:: ── Done ───────────────────────────────────────────────────────────────────
echo.
echo ═══════════════════════════════════════
echo  ACCESSIA Pro — Production locale
echo.
echo   Application  : http://localhost:3001
echo   API Swagger  : http://localhost:8000/docs
echo ═══════════════════════════════════════
echo.
timeout /t 8 /nobreak >nul
start http://localhost:3001
endlocal
goto :eof

:resolve_python
if defined PYTHON_CMD exit /b 0
where py >nul 2>&1
if not errorlevel 1 (
    py -3.11 -V >nul 2>&1 && set "PYTHON_CMD=py -3.11"
    if not defined PYTHON_CMD py -3.10 -V >nul 2>&1 && set "PYTHON_CMD=py -3.10"
    if not defined PYTHON_CMD py -3 -V >nul 2>&1 && set "PYTHON_CMD=py -3"
)
if not defined PYTHON_CMD (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD exit /b 1
exit /b 0

:create_venv
call %PYTHON_CMD% -m venv venv
exit /b %errorlevel%

:python_not_found
echo.
echo [ERREUR] Aucun interpreteur Python compatible n'a ete trouve.
echo          Installez Python 3.10+ ou verifiez la commande `py`.
exit /b 1
