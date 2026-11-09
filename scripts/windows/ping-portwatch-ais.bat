@echo off
rem ============================================================
rem  PortWatch Termini Imerese - aggiornamento area AIS
rem  Chiama /api/ais/status: se l'ultimo ciclo ha piu' di 15 minuti
rem  il Worker avvia il polling e genera eventi e notifiche email.
rem
rem  Uso manuale: doppio clic (una prova singola).
rem  Uso automatico: Utilita di pianificazione di Windows, ogni 15 minuti.
rem  Log: cartella "logs" accanto a questo file.
rem ============================================================
setlocal EnableExtensions
set "URL=https://site-32aceaf9996c406d9832e961f728fe05.freebuff.page/api/ais/status"
set "LOGDIR=%~dp0logs"
set "LOG=%LOGDIR%\portwatch-ais.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

where curl.exe >nul 2>nul
if errorlevel 1 goto with_powershell

curl.exe -f -sS -L -m 60 --connect-timeout 10 -o NUL "%URL%"
if errorlevel 1 goto failed
echo %date% %time% OK tramite curl>> "%LOG%"
exit /b 0

:with_powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri '%URL%'; exit 0 } catch { exit 1 }"
if errorlevel 1 goto failed
echo %date% %time% OK tramite PowerShell>> "%LOG%"
exit /b 0

:failed
echo %date% %time% ERRORE: richiesta non riuscita (rete, DNS o sito non raggiungibile)>> "%LOG%"
echo ATTENZIONE: richiesta non riuscita. Dettagli in "%LOG%".
exit /b 1
