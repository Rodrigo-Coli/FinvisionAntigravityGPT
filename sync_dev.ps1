
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    $branch = "dev"

    Write-Host "Iniciando sincronização robusta para branch: $branch"
    
    $files = @(
        "index.html",
        "index.tsx",
        "App.tsx",
        "types.ts",
        "package.json",
        "vite.config.ts",
        "vercel.json",
        "lib/supabase/client.ts",
        "lib/dateUtils.ts",
        "lib/historyUtils.ts",
        "lib/transactionSeriesUtils.ts",
        "services/ai.service.ts",
        "services/aiReconcile.service.ts",
        "services/dashboard.service.ts",
        "services/finance.service.ts",
        "services/geminiLive.service.ts",
        "services/reconciliation.service.ts",
        "pages/AIModule.tsx",
        "pages/Accounts.tsx",
        "pages/AdminUsers.tsx",
        "pages/Assets.tsx",
        "pages/CreditCards.tsx",
        "pages/ForgotPassword.tsx",
        "pages/History.tsx",
        "pages/Home.tsx",
        "pages/Login.tsx",
        "pages/PendingApproval.tsx",
        "pages/Reconcile.tsx",
        "pages/ResetPassword.tsx",
        "pages/Settings.tsx",
        "pages/Signup.tsx",
        "components/Nav.tsx",
        "components/SeriesScopeModal.tsx",
        "components/cards/AddCardModal.tsx",
        "components/cards/CardList.tsx",
        "components/cards/ManualTransactionModal.tsx",
        "components/cards/PayStatementModal.tsx",
        "components/cards/StatementSummary.tsx",
        "components/cards/TransactionList.tsx",
        "components/history/AddTransactionModal.tsx",
        "components/history/HistoryFilters.tsx",
        "components/history/PaymentModal.tsx",
        "components/history/TransactionTable.tsx"
    )

    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "`nSincronizando: $relPath"
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            # Tentar pegar SHA de qualquer branch para garantir que temos o histórico
            $sha = ""
            $testUris = @(
                "https://api.github.com/repos/$repo/contents/$relPath?ref=$branch",
                "https://api.github.com/repos/$repo/contents/$relPath?ref=main"
            )

            foreach ($uri in $testUris) {
                try {
                    $res = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction SilentlyContinue
                    if ($res.sha) {
                        $sha = $res.sha
                        Write-Host "  -> SHA encontrado: $sha"
                        break
                    }
                }
                catch {}
            }

            $body = @{
                message = "Antigravity Sync: Installment/Recurring Support and Modular Components"
                content = $base64
                branch  = $branch
            }
            if ($sha) { $body.sha = $sha }

            $json = $body | ConvertTo-Json
            try {
                Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
                Write-Host "  -> Sucesso!"
            }
            catch {
                $err = $_.Exception.Message
                if ($err -match "409" -or $err -match "422") {
                    Write-Host "  -> Conflito ou SHA ausente ($err)! Buscando SHA atual..."
                    $res = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$relPath?ref=$branch" -Headers $headers
                    $body.sha = $res.sha
                    $json = $body | ConvertTo-Json
                    Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
                    Write-Host "  -> Sucesso após recuperação!"
                }
                else {
                    Write-Host "  -> ERRO: $err"
                }
            }
        }
    }
    Write-Host "`n--- FINALIZADO ---"
}
catch {
    Write-Host "ERRO GERAL: $_"
}
