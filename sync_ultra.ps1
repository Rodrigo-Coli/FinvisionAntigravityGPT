
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$auth = "token $token"
$branch = "main"

# Lista ATOMICA de arquivos
$files = @(
    "pages/Accounts.tsx",
    "pages/CreditCards.tsx",
    "pages/History.tsx",
    "pages/Reconcile.tsx",
    "pages/AIModule.tsx",
    "pages/Assets.tsx",
    "pages/Goals.tsx",
    "pages/Budget.tsx",
    "pages/Settings.tsx",
    "components/history/TransactionTable.tsx",
    "components/history/HistoryFilters.tsx",
    "components/history/AddTransactionModal.tsx",
    "components/cards/CardList.tsx",
    "components/cards/StatementSummary.tsx",
    "components/cards/TransactionList.tsx",
    "components/Nav.tsx",
    "services/finance.service.ts",
    "services/dashboard.service.ts",
    "services/aiReconcile.service.ts",
    "lib/supabase/client.ts",
    "App.tsx",
    "src/sw.js",
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

    Write-Host "Iniciando SYNC ATOMICO TOTAL..."

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
            Write-Warning "Arquivo nao encontrado: $relPath"
        }
    }

    # 3. Pegar Base Tree
    $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits/$baseCommitSha" -Headers $headers
    $baseTreeSha = $commit.tree.sha

    # 4. Criar Tree
    Write-Host "Criando Tree..."
    $treePayload = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 100
    $newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treePayload -ContentType "application/json"

    # 5. Criar Commit
    Write-Host "Criando Commit..."
    $commitPayload = @{ 
        message = "fix(pwa): correct build errors and sync all files (Atomic Update)"; 
        tree = $newTree.sha; 
        parents = @($baseCommitSha) 
    } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitPayload -ContentType "application/json"

    # 6. Patch Ref
    Write-Host "Patching Branch..."
    $patchPayload = @{ sha = $newCommit.sha } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $patchPayload -ContentType "application/json"

    Write-Host "SUCESSO ATOMICO!"
}
catch {
    Write-Host "ERRO: $($_.Exception.Message)"
}
