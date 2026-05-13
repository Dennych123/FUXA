@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  FUXA Windows Service Installer
::  Requires: NSSM (bundled in tools\nssm.exe) or in PATH
:: ============================================================

set SERVICE_NAME=FUXA
set SERVICE_DISPLAY=FUXA SCADA/HMI
set SERVICE_DESC=FUXA Web-based Process Visualization (SCADA/HMI)
set FUXA_PORT=1881

:: Resolve script location → project root (2 levels up from app\windows-service)
set SCRIPT_DIR=%~dp0
for %%i in ("%SCRIPT_DIR%..\..")   do set FUXA_ROOT=%%~fi
set SERVER_DIR=%FUXA_ROOT%\server

:: ─── Check Admin ──────────────────────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Run this script as Administrator.
    pause & exit /b 1
)

:: ─── Check Node.js ────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org ^(LTS^)
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER% found.

:: ─── Find NSSM ────────────────────────────────────────────────────────────────
set NSSM_EXE=
if exist "%SCRIPT_DIR%tools\nssm.exe" (
    set NSSM_EXE=%SCRIPT_DIR%tools\nssm.exe
) else (
    where nssm >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=*" %%p in ('where nssm') do set NSSM_EXE=%%p
    )
)

if not defined NSSM_EXE (
    echo [ERROR] NSSM not found.
    echo   Option 1: Download nssm.exe from https://nssm.cc/download
    echo             and place it in: %SCRIPT_DIR%tools\nssm.exe
    echo   Option 2: Install via winget:  winget install NSSM.NSSM
    echo   Option 3: Install via choco:   choco install nssm
    pause & exit /b 1
)
echo [OK] NSSM found: %NSSM_EXE%

:: ─── Install Node dependencies ────────────────────────────────────────────────
echo.
echo [INFO] Installing server dependencies...
pushd "%SERVER_DIR%"
call npm install --omit=dev --quiet
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    popd & pause & exit /b 1
)
popd
echo [OK] Dependencies installed.

:: ─── Find node.exe full path ──────────────────────────────────────────────────
for /f "tokens=*" %%p in ('where node') do set NODE_EXE=%%p

:: ─── Remove existing service if present ──────────────────────────────────────
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Removing existing service...
    "%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
    "%NSSM_EXE%" remove "%SERVICE_NAME%" confirm >nul 2>&1
)

:: ─── Install service ──────────────────────────────────────────────────────────
echo.
echo [INFO] Installing Windows service...

"%NSSM_EXE%" install "%SERVICE_NAME%" "%NODE_EXE%" "main.js --port %FUXA_PORT%"
"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "%SERVICE_DISPLAY%"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "%SERVICE_DESC%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%SERVER_DIR%"

:: ─── Log files ────────────────────────────────────────────────────────────────
set LOG_DIR=%SERVER_DIR%\_logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%LOG_DIR%\service-stdout.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%LOG_DIR%\service-stderr.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 5242880

:: ─── Restart on failure ───────────────────────────────────────────────────────
"%NSSM_EXE%" set "%SERVICE_NAME%" AppExit Default Restart
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRestartDelay 5000

:: ─── Startup type: Automatic ──────────────────────────────────────────────────
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START

:: ─── Start service ────────────────────────────────────────────────────────────
echo.
echo [INFO] Starting service...
"%NSSM_EXE%" start "%SERVICE_NAME%"
timeout /t 3 /nobreak >nul

sc query "%SERVICE_NAME%" | find "RUNNING" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo  FUXA service installed and running!
    echo  Access: http://localhost:%FUXA_PORT%
    echo  Logs  : %LOG_DIR%
    echo ============================================================
) else (
    echo [WARN] Service installed but not running yet.
    echo        Check logs: %LOG_DIR%\service-stderr.log
)

echo.
pause
