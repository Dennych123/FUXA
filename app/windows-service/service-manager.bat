@echo off
setlocal

set SERVICE_NAME=FUXA
set FUXA_PORT=1881

:MENU
cls
echo ============================================================
echo   FUXA Service Manager
echo ============================================================
echo.
:: Show current status
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo   Status : [NOT INSTALLED]
) else (
    sc query "%SERVICE_NAME%" | find "RUNNING" >nul 2>&1
    if %errorlevel% equ 0 (
        echo   Status : [RUNNING]  ^-^>  http://localhost:%FUXA_PORT%
    ) else (
        echo   Status : [STOPPED]
    )
)
echo.
echo   [1] Start
echo   [2] Stop
echo   [3] Restart
echo   [4] Open in browser
echo   [5] View log
echo   [6] Exit
echo.
set /p CHOICE=Choose:

if "%CHOICE%"=="1" (
    net start "%SERVICE_NAME%"
    timeout /t 2 /nobreak >nul
    goto MENU
)
if "%CHOICE%"=="2" (
    net stop "%SERVICE_NAME%"
    timeout /t 2 /nobreak >nul
    goto MENU
)
if "%CHOICE%"=="3" (
    net stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
    net start "%SERVICE_NAME%"
    timeout /t 2 /nobreak >nul
    goto MENU
)
if "%CHOICE%"=="4" (
    start http://localhost:%FUXA_PORT%
    goto MENU
)
if "%CHOICE%"=="5" (
    set SCRIPT_DIR=%~dp0
    for %%i in ("%SCRIPT_DIR%..\..")   do set FUXA_ROOT=%%~fi
    set LOG=%FUXA_ROOT%\server\_logs\service-stderr.log
    if exist "!LOG!" (
        notepad "!LOG!"
    ) else (
        echo Log not found: !LOG!
        pause
    )
    goto MENU
)
if "%CHOICE%"=="6" exit /b 0
goto MENU
