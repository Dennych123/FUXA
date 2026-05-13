@echo off
setlocal

set SERVICE_NAME=FUXA
set SCRIPT_DIR=%~dp0

:: ─── Check Admin ──────────────────────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Run this script as Administrator.
    pause & exit /b 1
)

:: ─── Find NSSM ────────────────────────────────────────────────────────────────
set NSSM_EXE=
if exist "%SCRIPT_DIR%tools\nssm.exe" (
    set NSSM_EXE=%SCRIPT_DIR%tools\nssm.exe
) else (
    where nssm >nul 2>&1
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%p in ('where nssm') do set NSSM_EXE=%%p
    )
)

if not defined NSSM_EXE (
    echo [ERROR] NSSM not found.
    pause & exit /b 1
)

echo [INFO] Stopping and removing FUXA service...
"%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
"%NSSM_EXE%" remove "%SERVICE_NAME%" confirm

echo [OK] Service removed.
pause
