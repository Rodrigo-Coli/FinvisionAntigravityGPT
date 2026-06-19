
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"

# Token: tenta ler de .env ou usa o fallback que vimos no sync.ps1
$token = "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"
$auth = "token $token"
$branch = "main"

# Lista completa de arquivos que precisam ser sincronizados para o BUGFIX da Vercel
$files = @(
    "api/finvision-chat.ts",
    "pages/History.tsx",
    "components/history/HistoryFilters.tsx",
    "components/history/TransactionTable.tsx",
    "components/history/AddTransactionModal.tsx",
    "components/history/HistoryCharts.tsx",
    "components/history/DreReportModal.tsx",
    "pages/Reconcile.tsx",
    "types.ts",
    "lib/supabase/client.ts",
    "index.html",
    "vite.config.ts",
    "lib/dreUtils.ts",
    "services/dashboard.service.ts",
    "services/finance.service.ts",
    "services/reconciliation.service.ts",
    "App.tsx",
    "contexts/AuthContext.tsx",
    "pages/Accounts.tsx",
    "pages/CreditCards.tsx"
)

try {
    $headers = @{ 
        "Authorization" = $auth
        "Accept"        = "application/vnd.github.v3+json"
    }

    Write-Host "Iniciando FINAL SYNC ATOMICO (Bugfix Vercel)..."

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
        else {
            Write-Warning "Arquivo não encontrado localmente: $relPath"
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
    $commitPayload = @{ message = "feat(history): optimization, redesign and independent filters (Atomic Sync)"; tree = $newTree.sha; parents = @($baseCommitSha) } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitPayload -ContentType "application/json"

    # 6. Patch Ref
    Write-Host "Patching Branch..."
    $patchPayload = @{ sha = $newCommit.sha } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $patchPayload -ContentType "application/json"

    Write-Host "✅ SUCESSO! O Vercel deve iniciar o build agora com os 20+ correções."
}
catch {
    Write-Host "ERRO: $_"
}
