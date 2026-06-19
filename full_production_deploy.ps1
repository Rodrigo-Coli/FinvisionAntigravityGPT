
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $branch = "main"
    $token = "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"
    $headers = @{ 
        "Authorization" = "token $token"
        "Accept"        = "application/vnd.github.v3+json"
    }

    $files = @(
        "types.ts", "App.tsx", "index.tsx", "index.html", "package.json", "package-lock.json", "vite.config.ts", "vercel.json",
        "lib/supabase/client.ts", "lib/dateUtils.ts", "lib/historyUtils.ts", "lib/transactionSeriesUtils.ts", "lib/dreUtils.ts", "lib/offlineQueue.service.ts",
        "pages/Home.tsx", "pages/AIModule.tsx", "pages/Accounts.tsx", "pages/CreditCards.tsx", "pages/History.tsx", 
        "pages/Assets.tsx", "pages/Reconcile.tsx", "pages/AdminUsers.tsx", "pages/Settings.tsx", "pages/Login.tsx", 
        "pages/Signup.tsx", "pages/ForgotPassword.tsx", "pages/ResetPassword.tsx", "pages/PendingApproval.tsx",
        "pages/Goals.tsx", "pages/Budget.tsx",
        "services/aiReconcile.service.ts", "services/dashboard.service.ts", "services/reconciliation.service.ts", 
        "services/finance.service.ts", "services/ai.service.ts", "services/geminiLive.service.ts",
        "contexts/TourContext.tsx", "contexts/AuthContext.tsx", "contexts/ToastContext.tsx",
        "components/Nav.tsx", "components/SeriesScopeModal.tsx", "components/ai/OCRScanner.tsx", "components/ai/AIInsights.tsx", 
        "components/ai/VoiceAssistant.tsx", "components/cards/TransactionList.tsx", "components/cards/StatementSummary.tsx", 
        "components/cards/AddCardModal.tsx", "components/cards/CardList.tsx", "components/cards/ManualTransactionModal.tsx", 
        "components/cards/PayStatementModal.tsx", "components/history/AddTransactionModal.tsx", "components/history/HistoryFilters.tsx", 
        "components/history/PaymentModal.tsx", "components/history/TransactionTable.tsx", "components/history/HistoryCharts.tsx",
        "components/CashFlowProjection.tsx", "components/OfflineBanner.tsx", "components/AIChat.tsx", "components/ErrorBoundary.tsx",
        "lib/offlineQueue.ts",
        "api/handle-receipt-items.ts", "api/handle-bank-reconcile.ts", "api/handle-card-reconcile.ts", 
        "api/process-import.ts", "api/handle-financial-parse.ts", "api/handle-import-worker.ts", 
        "api/handle-wealth-analysis.ts", "api/parse-card-statement.ts", "api/parse-financial-document.ts", 
        "api/parse-statement.ts", "api/finvision-chat.ts", "api/categorize-transactions.ts", 
        "supabase/functions/parse-import/index.ts",
        "supabase/master_migration.sql", "supabase/clear_data.sql"
    )

    Write-Host "INICIANDO DEPLOY ATOMICO"

    $branchInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/$branch" -Headers $headers
    $baseTreeSha = $branchInfo.commit.commit.tree.sha
    $parentCommitSha = $branchInfo.commit.sha

    $treeItems = @()
    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "Blob: $relPath"
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json
            $blobResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody
            
            $treeItems += @{
                path = $relPath.Replace("\", "/")
                mode = "100644"
                type = "blob"
                sha  = $blobResponse.sha
            }
        }
    }

    Write-Host "Tree..."
    $treeBody = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 10
    $newTreeResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody

    Write-Host "Commit..."
    $commitBody = @{
        message = "Feature: AI Auto-Categorize Engine, SaaS Landing Page and History.tsx fixes"
        tree    = $newTreeResponse.sha
        parents = @($parentCommitSha)
    } | ConvertTo-Json
    $newCommitResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody

    Write-Host "Ref..."
    $refBody = @{ sha = $newCommitResponse.sha; force = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $refBody

    Write-Host "DEPLOY OK"
}
catch {
    $msg = $_.Exception.Message
    Write-Host "ERRO: $msg"
}
