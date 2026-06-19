---
description: Protocolo de Desenvolvimento Local (Motor) e Deploy de Produção via "APROVADO"
---

Este workflow estabelece o padrão de segurança e eficiência para desenvolvimento, evitando bloqueios de deploy (Vercel) e garantindo a qualidade final.

### 1. Criação do Motor Local (.bat)
Sempre que iniciar ou assumir um projeto, deve-se criar um motor portátil para o USER em `.bat`.
- **Caminho padrão do Node**: `C:\Users\rodrigo.coli\node-v20.11.1-win-x64`
- **Funcionalidades**:
    - Verificar a existência do motor.
    - Dar `cd` para a pasta do projeto.
    - Executar `npm install` automaticamente se `node_modules` não existir.
    - Executar `npm run dev -- --open` (ou comando equivalente) para abrir o navegador automaticamente.

Exemplo de estrutura:
```batch
@echo off
SET "NODE_PATH=C:\Users\rodrigo.coli\node-v20.11.1-win-x64"
SET "PATH=%NODE_PATH%;%PATH%"
cd /d "%~dp0"
if not exist "node_modules" (
    call npm install --no-audit --no-fund
)
call npm run dev -- --open
pause
```

### 2. Ciclo de Desenvolvimento e Validação
1. **Alterações**: O Antigravity executa as modificações solicitadas.
2. **Teste Local**: O USER executa o arquivo `.bat` criado para validar as alterações em tempo real no ambiente local.
3. **Economia de Recursos**: Não deve ser feito deploy automático para a Vercel durante a fase de ajustes visuais ou de lógica.

### 3. Protocolo "APROVADO" (Deploy de Produção)
O Antigravity **NUNCA** deve fazer deploy direto na branch de produção (`main`) sem o comando explícito.

- **Gatilho**: O USER deve digitar a palavra **APROVADO**.
- **Ação**: Somente após o gatilho, o Antigravity executará o script de sincronização de produção (`sync.ps1`).
- **Scripts de Sync**: Devem ser mantidos atualizados com a lista completa de arquivos críticos (páginas, serviços, componentes e configs).

### 4. Gestão de Branches
- **Branch `dev`**: Reservada para testes de integração e "preview" se necessário.
- **Branch `main`**: Somente para versões aprovadas via protocolo.
