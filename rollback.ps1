# FinVision Pro — Script de Rollback
# Execute este script se o site apresentar problemas após uma atualização.
# Ele restaura o último backup estável direto no GitHub (→ Vercel redeploy automático).

param(
    [string]$BackupLabel = "" # Opcional: especifique o backup ex: "backup_20260225_1503"
)

try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $branch = "main"
    $token = "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"
    $headers = @{
        "Authorization" = "token $token"
        "Accept"        = "application/vnd.github.v3+json"
    }

    # Find latest backup folder
    $backupRoot = Join-Path (Get-Location).Path "_backup_original"
    if (-not (Test-Path $backupRoot)) {
        Write-Error "❌ Pasta _backup_original não encontrada. Execute a partir da raiz do projeto."
        exit 1
    }

    $backups = Get-ChildItem $backupRoot -Directory | Sort-Object Name -Descending
    if ($backups.Count -eq 0) {
        Write-Error "❌ Nenhum backup encontrado em _backup_original."
        exit 1
    }

    $selected = if ($BackupLabel) {
        $backups | Where-Object { $_.Name -eq $BackupLabel } | Select-Object -First 1
    }
    else {
        $backups | Select-Object -First 1
    }

    if (-not $selected) {
        Write-Error "❌ Backup '$BackupLabel' não encontrado."
        exit 1
    }

    Write-Host "🔄 ROLLBACK INICIADO" -ForegroundColor Yellow
    Write-Host "📁 Restaurando backup: $($selected.Name)" -ForegroundColor Cyan

    # Files to restore from backup
    $files = @(
        "types.ts", "App.tsx", "index.tsx", "index.html", "package.json",
        "pages/Home.tsx", "pages/History.tsx", "pages/Accounts.tsx",
        "pages/CreditCards.tsx", "pages/Assets.tsx", "pages/Settings.tsx",
        "pages/Goals.tsx", "pages/Budget.tsx",
        "components/Nav.tsx",
        "components/history/TransactionTable.tsx",
        "components/history/HistoryCharts.tsx",
        "components/history/HistoryFilters.tsx",
        "lib/historyUtils.ts", "lib/dateUtils.ts"
    )

    $branchInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/$branch" -Headers $headers
    $baseTreeSha = $branchInfo.commit.commit.tree.sha
    $parentCommit = $branchInfo.commit.sha

    $treeItems = @()
    foreach ($relPath in $files) {
        $filePath = Join-Path $selected.FullName $relPath
        if (Test-Path $filePath) {
            Write-Host "  ↩️  $relPath"
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            $blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json
            $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody
            $treeItems += @{ path = $relPath.Replace("\", "/"); mode = "100644"; type = "blob"; sha = $blob.sha }
        }
    }

    $treeBody = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 10
    $newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody

    $commitBody = @{
        message = "rollback: restaurando $($selected.Name)"
        tree    = $newTree.sha
        parents = @($parentCommit)
    } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody

    $refBody = @{ sha = $newCommit.sha } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $refBody | Out-Null

    Write-Host ""
    Write-Host "✅ ROLLBACK CONCLUÍDO!" -ForegroundColor Green
    Write-Host "🌐 Vercel está reconstruindo... aguarde ~60 segundos." -ForegroundColor Cyan
    Write-Host "🔗 https://finvision-antigravity-gpt.vercel.app" -ForegroundColor White
}
catch {
    Write-Error "❌ Erro no rollback: $_"
    exit 1
}
