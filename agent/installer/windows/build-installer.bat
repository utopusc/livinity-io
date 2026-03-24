@echo off
echo ============================================
echo  Livinity Agent Windows Installer Builder
echo ============================================
echo.

echo Step 1: Building SEA binary...
cd /d "%~dp0..\.."
call npm run build:sea
if errorlevel 1 (
    echo.
    echo FAILED: SEA build failed
    exit /b 1
)
echo.

echo Step 2: Compiling installer with Inno Setup...
where iscc >nul 2>&1
if errorlevel 1 (
    echo ERROR: ISCC.exe not found.
    echo.
    echo Install Inno Setup 6 from https://jrsoftware.org/isdl.php
    echo and add its directory to your system PATH.
    echo.
    echo Typical location: C:\Program Files (x86)\Inno Setup 6\
    exit /b 1
)
iscc installer\windows\setup.iss
if errorlevel 1 (
    echo.
    echo FAILED: Inno Setup compilation failed
    exit /b 1
)
echo.
echo ============================================
echo  SUCCESS: Installer created at:
echo  dist\installer\LivinityAgentSetup.exe
echo ============================================
