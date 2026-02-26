@echo off
echo =======================================
echo Autogravity Auto-Build Script
echo =======================================

echo 1. Installing dependencies...
call npm install

echo 2. Compiling TypeScript...
call npm run compile

echo 3. Packaging VSIX...
call npx @vscode/vsce package

echo =======================================
echo Done! You can now install the generated .vsix file to VSCode.
pause
