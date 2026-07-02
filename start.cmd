@echo off
REM Windows-Starter: like lokal mit voller Funktion (Server + Browser). Doppelklick genuegt.
cd /d "%~dp0"
where node >nul 2>nul && (set "NODE=node") || (set "NODE=C:\Program Files\nodejs\node.exe")
echo Starte like auf http://localhost:5173 ...
"%NODE%" server.mjs --open
echo.
echo Server beendet. Fenster kann geschlossen werden.
pause >nul
