@echo off
echo Arrêt de ACCESSIA Pro...
docker compose down 2>nul || docker-compose down
echo ✅ Services arrêtés.
pause
