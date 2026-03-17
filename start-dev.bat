@echo off
title SENSIA Manager — Dev (sans Docker)

echo.
echo  SENSIA Manager — Mode Développement (sans Docker)
echo  ══════════════════════════════════════════════════
echo.

:: Vérifier Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python 3.11+ requis.
    pause & exit /b 1
)

:: Vérifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js 20+ requis.
    pause & exit /b 1
)

:: Copier .env si absent
if not exist ".env" copy .env.example .env > nul

:: ── Backend ──────────────────────────────────────────────────
echo [1/3] Installation des dépendances Python...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt -q

echo [2/3] Démarrage du backend FastAPI (port 8000)...
start "SENSIA Backend" cmd /k "venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
cd ..

:: ── Frontend ─────────────────────────────────────────────────
echo [3/3] Démarrage du frontend Next.js (port 3001)...
cd frontend
if not exist node_modules (
    echo Installation des dépendances npm...
    npm install
)
start "SENSIA Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ══════════════════════════════════════════════════
echo  ✅ SENSIA Manager démarré en mode DEV !
echo.
echo   → Application  : http://localhost:3001
echo   → API (Swagger): http://localhost:8000/docs
echo.
echo  [Note] Twenty CRM non démarré en mode DEV.
echo  Lancez start.bat pour le mode complet avec Docker.
echo ══════════════════════════════════════════════════
echo.
timeout /t 5 /nobreak > nul
start http://localhost:3001
