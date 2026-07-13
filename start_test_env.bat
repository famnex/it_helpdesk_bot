@echo off
title IT-Helpdesk Testumgebung
echo ===================================================
echo   Schul-Support KI - Testumgebung starten
echo ===================================================
echo.

:: Check if node_modules exist, if not run npm install
if not exist "node_modules\" (
    echo [INFO] node_modules nicht gefunden. Installiere Abhaengigkeiten...
    call npm install
    if %errorlevel% neq 0 (
        echo [FEHLER] Fehler bei npm install. Bitte manuell ausfuehren!
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Die Datenbank (SQLite) ist dateibasiert und startet automatisch
echo        mit dem Next.js Development Server. Es wird kein separater
echo        Datenbank-Server (wie MySQL/PostgreSQL) benoetigt.
echo.

echo [1/2] Starte Maildev (Mock-E-Mail-Server)...
start "IT-Helpdesk Maildev" cmd /k "npx -y maildev --ip 127.0.0.1 --web-ip 127.0.0.1"

echo [2/2] Starte Next.js Development Server...
start "IT-Helpdesk Dev Server" cmd /k "npm run dev"

echo.
echo Warte kurz auf Initialisierung der Server (ca. 6 Sekunden)...
timeout /t 6 /nobreak >nul

echo Oeffne Web-Oberflaechen im Browser...
start http://localhost:3000
start http://localhost:1080

echo.
echo ===================================================
echo   Testumgebung erfolgreich initiiert!
echo ===================================================
echo   - Maildev Web-Oberflaeche: http://localhost:1080
echo   - IT-Helpdesk Anwendung:   http://localhost:3000
echo ===================================================
echo.
pause
