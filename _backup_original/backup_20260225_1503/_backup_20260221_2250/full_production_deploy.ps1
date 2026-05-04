
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    
    Write-Host "`n--- INICIANDO DEPLOY COMPLETO PARA PRODUÇÃO ---"
    Write-Host "Repositório: $repo"

    $files = @(
        # Core & Config
        "types.ts",
        "App.tsx",
        "index.tsx",
        "index.html",
        "package.json",
        "vite.config.ts",
        "vercel.json",
        "lib/supabase/client.ts",
        "lib/dateUtils.ts",
        "lib/historyUtils.ts",

        # Pages
        "pages/Home.tsx",
        "pages/AIModule.tsx",
        "pages/Accounts.tsx",
        "pages/CreditCards.tsx",
        "pages/History.tsx",
        "pages/Assets.tsx",
        "pages/Reconcile.tsx",
        "pages/AdminUsers.tsx",
        "pages/Settings.tsx",
        "pages/Login.tsx",
        "pages/Signup.tsx",

        # Services
        "services/aiReconcile.service.ts",
        "services/dashboard.service.ts",
        "services/reconciliation.service.ts",
        "services/finance.service.ts",
        "services/ai.service.ts",
        "services/geminiLive.service.ts",

        # Components
        "components/Nav.tsx",
        "components/ai/OCRScanner.tsx",
        "components/cards/TransactionList.tsx",
        "components/cards/StatementSummary.tsx",
        "components/history/TransactionTable.tsx",
        "components/history/TransactionFilters.tsx",

        # API
        "api/handle-receipt-items.ts"
    )

    $successCount = 0
    $failCount = 0

    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "Sincronizando: $relPath..."
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $sha = ""
            try {
                $existingFile = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -ErrorAction SilentlyContinue
                $sha = $existingFile.sha
            }
            catch {}

            $body = @{
                message = "Production Deploy: Full Sync of all approved features and fixes"
                content = $base64
            }
            if ($sha) { $body.sha = $sha }

            $json = $body | ConvertTo-Json
            try {
                Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
                Write-Host "  [OK]"
                $successCount++
            }
            catch {
                Write-Host "  [ERRO] ao enviar $relPath : $_"
                $failCount++
            }
        }
        else {
            Write-Host "  [AVISO] Arquivo não encontrado localmente: $relPath"
        }
    }
    
    Write-Host "`n--- RESUMO DO DEPLOY ---"
    Write-Host "Arquivos Sincronizados: $successCount"
    Write-Host "Falhas: $failCount"
    Write-Host "------------------------"
    
    if ($failCount -eq 0) {
        Write-Host "PRODUÇÃO TOTALMENTE ATUALIZADA COM SUCESSO! 🚀"
    }
    else {
        Write-Host "DEPLOY CONCLUÍDO COM ALGUMAS FALHAS. VERIFIQUE OS LOGS ACIMA."
    }
}
catch {
    Write-Host "ERRO CRÍTICO NO SCRIPT DE DEPLOY: $_"
}
