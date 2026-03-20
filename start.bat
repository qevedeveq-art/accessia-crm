@echo off
title ACCESSIA Pro

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║         ACCESSIA Pro v1.2.0               ║
echo  ║   Conseil IA · PME et Entrepreneurs       ║
echo  ╚═══════════════════════════════════════════╝
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

echo [1/2] Démarrage du backend FastAPI...
docker compose up -d backend 2>nul || docker-compose up -d backend

echo.
echo [2/2] Démarrage du frontend Next.js...
docker compose up -d frontend 2>nul || docker-compose up -d frontend

echo.
echo ══════════════════════════════════════════════════
echo  ✅ ACCESSIA Pro est démarré !
echo.
echo   → Application  : http://localhost:3001
echo   → API (Swagger): http://localhost:8001/docs
echo ══════════════════════════════════════════════════
echo.
echo Appuyez sur une touche pour ouvrir le navigateur...
pause > nul

start http://localhost:3001
