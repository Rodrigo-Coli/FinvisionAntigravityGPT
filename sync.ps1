
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"

# Token: lê de .env se existir, senão usa fallback
$envFile = Join-Path (Get-Location).Path ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile | Where-Object { $_ -match "^GITHUB_TOKEN=" }
    if ($envContent) {
        $token = ($envContent -split "=", 2)[1].Trim()
    }
}
if (-not $token) {
    $token = "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"
}

$auth = "token $token"
$branch = "main"

$files = @(
    # === PAGES ===
    "pages/Home.tsx",
    "pages/Login.tsx",
    "pages/Signup.tsx",
    "pages/ForgotPassword.tsx",
    "pages/ResetPassword.tsx",
    "pages/PendingApproval.tsx",
    "pages/Accounts.tsx",
    "pages/CreditCards.tsx",
    "pages/History.tsx",
    "pages/Reconcile.tsx",
    "pages/AIModule.tsx",
    "pages/Assets.tsx",
    "pages/Goals.tsx",
    "pages/Budget.tsx",
    "pages/Settings.tsx",
    "pages/AdminUsers.tsx",

    # === COMPONENTS — History ===
    "components/history/TransactionTable.tsx",
    "components/history/HistoryFilters.tsx",
    "components/history/HistoryCharts.tsx",
    "components/history/AddTransactionModal.tsx",
    "components/history/PaymentModal.tsx",

    # === COMPONENTS — Cards ===
    "components/cards/CardList.tsx",
    "components/cards/StatementSummary.tsx",
    "components/cards/TransactionList.tsx",
    "components/cards/AddCardModal.tsx",
    "components/cards/ManualTransactionModal.tsx",
    "components/cards/PayStatementModal.tsx",

    # === COMPONENTS — AI ===
    "components/ai/AIInsights.tsx",
    "components/ai/OCRScanner.tsx",
    "components/ai/VoiceAssistant.tsx",
    "components/AIChat.tsx",

    "components/Nav.tsx",
    "components/CashFlowProjection.tsx",
    "components/OfflineBanner.tsx",
    "components/SeriesScopeModal.tsx",
    "components/ErrorBoundary.tsx",

    # === SERVICES ===
    "services/finance.service.ts",
    "services/dashboard.service.ts",
    "services/reconciliation.service.ts",
    "services/aiReconcile.service.ts",
    "services/ai.service.ts",
    "services/geminiLive.service.ts",

    # === LIB ===
    "lib/supabase/client.ts",
    "lib/dateUtils.ts",
    "lib/historyUtils.ts",
    "lib/offlineQueue.ts",
    "lib/offlineQueue.service.ts",
    "lib/transactionSeriesUtils.ts",

    # === CONTEXTS ===
    "contexts/TourContext.tsx",
    "contexts/ToastContext.tsx",
    "contexts/AuthContext.tsx",

    # === TESTS ===
    "tests/dateUtils.test.ts",
    "tests/financial.test.ts",
    "vitest.config.ts",

    # === API (Serverless Functions) ===
    "api/index.ts",
    "api/handle-bank-reconcile.ts",
    "api/handle-card-reconcile.ts",
    "api/finvision-chat.ts",
    "api/categorize-transactions.ts",
    "api/handle-financial-parse.ts",
    "api/handle-import-worker.ts",
    "api/handle-receipt-items.ts",
    "api/handle-wealth-analysis.ts",
    "api/parse-card-statement.ts",
    "api/parse-financial-document.ts",
    "api/parse-statement.ts",
    "api/process-import.ts",
    "api/asaas-webhook.ts",
    "api/whatsapp-webhook.ts",
    "api/notify-bills-due.ts",

    # === SUPABASE FUNCTIONS ===
    "supabase/functions/parse-import/index.ts",

    # === ROOT ===
    "App.tsx",
    "index.tsx",
    "index.html",
    "public/logo.svg",
    "public/manifest.json",
    "types.ts",
    "package.json",
    "vite.config.ts",
    "vercel.json"
)

try {
    $headers = @{ 
        "Authorization" = $auth
        "Accept"        = "application/vnd.github.v3+json"
    }

    Write-Host "Iniciando Sync Atomico v2..."

    # 1. Pegar o SHA do commit atual
    $ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers
    $baseCommitSha = $ref.object.sha
    Write-Host "Base Commit: $baseCommitSha"

    # 2. Criar BLOBS
    $treeItems = @()
    foreach ($relPath in $files) {
        $localPath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $localPath) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $b64 = [Convert]::ToBase64String($bytes)
            
            $blobJson = @{ content = $b64; encoding = "base64" } | ConvertTo-Json
            $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobJson -ContentType "application/json"
            
            $treeItems += @{ path = $relPath; mode = "100644"; type = "blob"; sha = $blob.sha }
            Write-Host "Blob OK: $relPath"
        }
    }

    # 3. Base Tree
    $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits/$baseCommitSha" -Headers $headers
    $baseTreeSha = $commit.tree.sha

    # 4. Criar Tree
    Write-Host "Criando Tree..."
    $treePayload = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 100
    $newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treePayload -ContentType "application/json"

    # 5. Criar Commit
    Write-Host "Criando Commit..."
    $commitPayload = @{ message = "Infra: Migrate to Standalone Architecture for Elite API Functions (Isolamento de Memória)"; tree = $newTree.sha; parents = @($baseCommitSha) } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitPayload -ContentType "application/json"

    # 6. Patch Ref
    Write-Host "Patching Branch..."
    $patchPayload = @{ sha = $newCommit.sha } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $patchPayload -ContentType "application/json"

    Write-Host "Sucesso: Um unico deploy disparado."
}
catch {
    Write-Host "ERRO: $_"
}
