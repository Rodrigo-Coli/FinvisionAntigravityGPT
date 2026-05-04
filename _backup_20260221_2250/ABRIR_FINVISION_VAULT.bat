@echo off
:: Configura o motor portatil que baixamos
SET "NODE_PATH=C:\Users\rodrigo.coli\node-v20.11.1-win-x64"
SET "PATH=%NODE_PATH%;%PATH%"

cls
echo ============================================================
echo           FINVISION PRO - EXPERT TERMINAL
echo ============================================================
echo.

:: Verifica se o motor esta acessivel
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O motor portatil foi bloqueado ou nao encontrado.
    echo Caminho tentado: %NODE_PATH%
    echo.
    echo Por favor, tire uma foto desta tela e me envie.
    pause
    exit
)

echo [OK] Motor detectado (%NODE_PATH%)
echo [OK] Entrando na pasta do projeto...

cd /d "%~dp0"

echo [OK] Pasta atual: %CD%
echo.

:: Se a pasta node_modules nao existir, tenta instalar
if not exist "node_modules" (
    echo [!] Primeira vez: Baixando componentes do sistema...
    echo [!] Isso pode demorar 2-3 minutos. Nao feche a janela.
    echo.
    call npm install --no-audit --no-fund
)

echo.
echo ============================================================
echo  LIGANDO O SISTEMA (ESTILO VAULT)... 
echo  O CHROME VAI ABRIR AUTOMATICAMENTE EM SEGUIDA.
echo ============================================================
echo.

:: Comando para abrir e ja tentar chamar o navegador
call npm run dev -- --open

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O sistema nao conseguiu iniciar.
    pause
)
pause
