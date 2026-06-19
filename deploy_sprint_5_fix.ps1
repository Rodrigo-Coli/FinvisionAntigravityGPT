$ErrorActionPreference = "Stop"

$repoPath = "c:\Users\rodrigo.coli\Documents\Antigravity\FinVision-GPT-main\FinVision-GPT-main"
cd $repoPath

try {
    Write-Host "Verificando status do repositório..."
    
    # Ensure on main branch
    git checkout main

    $files = @(
        "api/finvision-chat.ts",
        "pages/History.tsx",
        "components/history/HistoryFilters.tsx",
        "components/history/TransactionTable.tsx",
        "components/history/AddTransactionModal.tsx",
        "components/history/DreReportModal.tsx",
        "pages/Reconcile.tsx",
        "types.ts",
        "migration_subcategories.sql",
        "lib/supabase/client.ts",
        "index.html",
        "vite.config.ts",
        "lib/dreUtils.ts",
        "services/reconciliation.service.ts",
        "App.tsx",
        "contexts/AuthContext.tsx",
        "pages/Accounts.tsx",
        "pages/CreditCards.tsx",
        "services/dashboard.service.ts",
        "services/finance.service.ts"
    )
    
    Write-Host "Adicionando arquivos corrigidos para o Vercel Build..."
    foreach ($file in $files) {
        if (Test-Path $file) {
            git add $file
            Write-Host "  - Adicionado: $file"
        }
        else {
            Write-Warning "  - Arquivo não encontrado: $file"
        }
    }

    Write-Host "Criando commit de correção de Build..."
    git commit -m "fix(build): inject missing TS modules and resolve strict implicit any parameters"
    
    Write-Host "Enviando para o remote GitHub..."
    git push origin main
    
    Write-Host "✅ Deploy enviado com sucesso! O Vercel iniciará o build automaticamente."
}
catch {
    Write-Error "Deploy falhou: $_"
}
