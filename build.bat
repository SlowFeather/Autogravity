@echo off
setlocal
echo =======================================
echo Autogravity Auto-Build Script
echo =======================================

echo.
echo Current version in package.json:
findstr /C:"\"version\"" package.json

echo.
echo Version bump options:
echo 1. Patch (e.g. 0.0.1 -^> 0.0.2)
echo 2. Minor (e.g. 0.0.1 -^> 0.1.0)
echo 3. Major (e.g. 0.0.1 -^> 1.0.0)
echo 4. Skip (keep current version)
set /p bumpChoice="Choose option (1-4) [Press Enter for Patch]: "

if "%bumpChoice%"=="" set bumpChoice=1

if "%bumpChoice%"=="1" call npm version patch
if "%bumpChoice%"=="2" call npm version minor
if "%bumpChoice%"=="3" call npm version major

echo.
echo 1. Installing dependencies...
call npm install

echo.
echo 2. Compiling TypeScript...
call npm run compile

echo.
echo 3. Packaging VSIX...
call npx @vscode/vsce package

echo.
echo =======================================
echo Done! You can now install the generated .vsix file to VSCode.
pause
