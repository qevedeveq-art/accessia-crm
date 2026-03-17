@echo off
title SENSIA Manager

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║         SENSIA MANAGER v1.0           ║
echo  ║   Conseil IA · PME et Entrepreneurs   ║
echo  ╚═══════════════════════════════════════╝
echo.

:: Vérifier si .env existe
if not exist ".env" (
    echo [INFO] Copie de .env.example vers .env...
    copy .env.example .env > nul
    echo [INFO] .env créé — pensez à personnaliser les secrets dans ce fichier.
    echo.
)

:: Vérifier Docker
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker n'est pas installé ou pas dans le PATH.
    echo Téléchargez Docker Desktop : https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo [1/3] Démarrage de la base de données et de Twenty CRM...
docker-compose up -d twenty-db twenty-redis twenty-server

echo.
echo [2/3] Démarrage du backend FastAPI...
docker-compose up -d backend

echo.
echo [3/3] Démarrage du frontend Next.js...
docker-compose up -d frontend

echo.
echo ══════════════════════════════════════════════════
echo  ✅ SENSIA Manager est démarré !
echo.
echo   → Application  : http://localhost:3001
echo   → API Backend  : http://localhost:8000/docs
echo   → CRM (Twenty) : http://localhost:3000
echo ══════════════════════════════════════════════════
echo.
echo Appuyez sur une touche pour ouvrir le navigateur...
pause > nul

start http://localhost:3001
