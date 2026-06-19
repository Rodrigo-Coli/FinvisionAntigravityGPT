try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $branch = "main"
    $token = "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"
    $headers = @{ 
        "Authorization" = "token $token"
        "Accept"        = "application/vnd.github.v3+json"
    }

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
        "vite.config.ts"
    )

    Write-Host "INICIANDO DEPLOY ATOMICO - SPRINT 5"

    $branchInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/$branch" -Headers $headers
    $baseTreeSha = $branchInfo.commit.commit.tree.sha
    $parentCommitSha = $branchInfo.commit.sha

    $treeItems = @()
    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "Lendo arquivo para envio: $relPath"
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json -Depth 5
            $blobResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody -ContentType "application/json"
            
            $treeItems += @{
                path = $relPath.Replace("\", "/")
                mode = "100644"
                type = "blob"
                sha  = $blobResponse.sha
            }
        }
        else {
            Write-Host "Arquivo não encontrado: $relPath"
        }
    }

    Write-Host "Montando a nova Tree na nuvem..."
    $treeBody = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 10
    $newTreeResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody -ContentType "application/json"

    Write-Host "Gerando Commit..."
    $commitBody = @{
        message = "Atomic Deploy: Elite AI Upgrade, Wealth X-Ray and Subcategories Logic"
        tree    = $newTreeResponse.sha
        parents = @($parentCommitSha)
    } | ConvertTo-Json -Depth 5
    $newCommitResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody -ContentType "application/json"

    Write-Host "Atualizando apontador HEAD da branch main..."
    $refBody = @{ sha = $newCommitResponse.sha; force = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $refBody -ContentType "application/json" | Out-Null

    Write-Host "DEPLOY FINALIZADO COM SUCESSO!"
}
catch {
    $msg = $_.Exception.Message
    Write-Host "ERRO FATAL: $msg"
}
