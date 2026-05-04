
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }
$branch = "dev"

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
    "components/history/TransactionTable.tsx",
    "pages/api/parse-financial-document.ts"
)

foreach ($relPath in $files) {
    $filePath = Join-Path (Get-Location).Path $relPath
    if (!(Test-Path $filePath)) {
        continue
    }

    $content = [System.IO.File]::ReadAllBytes($filePath)
    $base64 = [Convert]::ToBase64String($content)

    $sha = ""
    try {
        $uri = "https://api.github.com/repos/$repo/contents/${relPath}?ref=$branch"
        $res = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction SilentlyContinue
        if ($res -and $res.sha) { $sha = $res.sha }
    }
    catch {}

    $body = @{
        message = "Antigravity Sync: Installment/Recurring Support and Complete Modularization"
        content = $base64
        branch  = $branch
    }
    if ($sha) { $body.sha = $sha }

    try {
        Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/${relPath}" -Headers $headers -Body ($body | ConvertTo-Json) -ContentType "application/json"
        Write-Host "SYNC OK: $relPath"
    }
    catch {
        Write-Host "SYNC FAIL: $relPath - $($_.Exception.Message)"
    }
}
Write-Host "`n--- FINALIZADO ---"
