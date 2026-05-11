@echo off
title Top 8 Generator
echo ============================================
echo   Top 8 Generator — Lancement
echo ============================================
echo.
cd /d "%~dp0"

:: Essayer Python
python --version >nul 2>&1
if not errorlevel 1 (
    echo Serveur lance avec Python...
    echo Ouverture de l'outil dans le navigateur...
    start "" "http://localhost:8080"
    python -m http.server 8080
    goto fin
)

py --version >nul 2>&1
if not errorlevel 1 (
    echo Serveur lance avec Python...
    start "" "http://localhost:8080"
    py -m http.server 8080
    goto fin
)

:: Essayer Node.js
node --version >nul 2>&1
if not errorlevel 1 (
    echo Serveur lance avec Node.js...
    start "" "http://localhost:8080"
    npx serve . -p 8080
    goto fin
)

:: Rien de trouve
echo.
echo ❌ Ni Python ni Node.js n'est installe.
echo.
echo Pour installer Python (recommande) :
echo   1. Va sur https://python.org
echo   2. Telecharge la derniere version
echo   3. IMPORTANT : coche "Add Python to PATH"
echo   4. Relance ce fichier
echo.
pause
:fin
