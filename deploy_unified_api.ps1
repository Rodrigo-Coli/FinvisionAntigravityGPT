
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

# Auto-bump version.json so UpdateAlert fires for users with old version open
$now = Get-Date -Format "yyyy.MM.dd.HHmm"
$versionContent = "{ `"version`": `"$now`" }`n"
Set-Content -Path "public\version.json" -Value $versionContent -Encoding UTF8
Write-Host "=== FinVision Pro - Deploy API Unificada ===" -ForegroundColor Cyan
Write-Host "Repositorio: $repo" -ForegroundColor Gray
Write-Host "Branch: $branch | Versao: $now" -ForegroundColor Gray

# Get current HEAD SHA
Write-Host "`n[1/6] Obtendo SHA do commit atual..." -ForegroundColor Yellow
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
$lastSha = $ref.object.sha
Write-Host "  SHA atual: $lastSha" -ForegroundColor Gray

# Collect ALL files to deploy
$paths = @(
    "pages", "components", "services", "lib", "contexts", 
    "hooks", "utils", "api", "public", "src",
    "index.html", "App.tsx", "index.tsx",
    "types.ts", "package.json", "vite.config.ts", 
    "vercel.json", "tsconfig.json", ".vercelignore",
    "vitest.config.ts", "vite-env.d.ts", "tests"
)

Write-Host "`n[2/6] Coletando arquivos..." -ForegroundColor Yellow
$treeItems = @()
$fileCount = 0

foreach ($p in $paths) {
    if (Test-Path $p) {
        $files = if ((Get-Item $p).PSIsContainer) { 
            Get-ChildItem -Path $p -Recurse -File 
        } else { 
            Get-Item $p 
        }
        
        foreach ($f in $files) {
            # Skip node_modules, dist, .git, backups, and temp files
            if ($f.FullName -match "node_modules|\\dist\\|\.git\\|_backup|backups\\|\.gemini") { continue }
            
            # Include relevant file types
            if ($f.Extension -match "\.(ts|tsx|js|jsx|json|html|css|svg|png|jpg|jpeg|md|webmanifest)$") {
                $rel = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
                Write-Host "  + $rel" -ForegroundColor DarkGray
                
                try {
                    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
                    $blobBody = @{content=$b64; encoding="base64"} | ConvertTo-Json
                    $blob = Invoke-RestMethod -Method Post `
                        -Uri "https://api.github.com/repos/$repo/git/blobs" `
                        -Headers $headers `
                        -Body $blobBody `
                        -ContentType "application/json"
                    
                    $treeItems += @{path=$rel; mode="100644"; type="blob"; sha=$blob.sha}
                    $fileCount++
                } catch {
                    Write-Host "  ERRO no arquivo $rel : $_" -ForegroundColor Red
                }
            }
        }
    }
}

# IMPORTANT: Delete old individual API files from GitHub that were consolidated into index.ts
Write-Host "`n[3/6] Marcando arquivos antigos para deleção..." -ForegroundColor Yellow
$filesToDelete = @(
    "api/categorize-transactions.ts",
    "api/finvision-chat.ts",
    "api/handle-bank-reconcile.ts",
    "api/handle-card-reconcile.ts",
    "api/handle-wealth-analysis.ts",
    "api/parse-card-statement.ts",
    "api/parse-statement.ts",
    "api/process-import.ts",
    "pages/api/parse-financial-document.ts"
)

foreach ($delFile in $filesToDelete) {
    Write-Host "  - DELETAR: $delFile" -ForegroundColor Red
}

Write-Host "`n  Total de arquivos para enviar: $fileCount" -ForegroundColor Green
Write-Host "  Total de arquivos para deletar: $($filesToDelete.Count)" -ForegroundColor Red

# Create tree (NOT using base_tree to ensure deletions take effect)
# We need to get the full tree first, then rebuild without the deleted files
Write-Host "`n[4/6] Criando tree no GitHub (com deleções)..." -ForegroundColor Yellow

# Get the current tree recursively
$currentCommit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits/$lastSha" -Headers $headers
$currentTreeSha = $currentCommit.tree.sha
$currentTree = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/trees/$($currentTreeSha)?recursive=1" -Headers $headers

# Build new tree: keep existing files (except deleted ones), add/update our files
$finalTreeItems = @()

# Add existing files from remote that we're NOT deploying and NOT deleting
$ourPaths = $treeItems | ForEach-Object { $_.path }
foreach ($item in $currentTree.tree) {
    if ($item.type -eq "blob") {
        $isOurs = $ourPaths -contains $item.path
        $isDeleted = $filesToDelete -contains $item.path
        if (-not $isOurs -and -not $isDeleted) {
            $finalTreeItems += @{path=$item.path; mode=$item.mode; type="blob"; sha=$item.sha}
        }
    }
}

# Add our new/updated files
$finalTreeItems += $treeItems

$treeBody = @{tree=$finalTreeItems} | ConvertTo-Json -Depth 10
$tree = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/trees" `
    -Headers $headers `
    -Body $treeBody `
    -ContentType "application/json"
Write-Host "  Tree SHA: $($tree.sha)" -ForegroundColor Gray

# Create commit
Write-Host "`n[5/6] Criando commit..." -ForegroundColor Yellow
$commitMessage = "fix: API unificada - consolidar todas as rotas em api/index.ts

- Consolidar 9 serverless functions em 1 roteador unico (api/index.ts)
- Mover handlers para api/_lib/ (ignorados pela Vercel como functions)
- Adicionar rota handle-receipt-items que estava faltando
- Deletar arquivos individuais da raiz de api/
- Deletar pages/api/parse-financial-document.ts (stub fantasma)
- Atualizar vercel.json com catch-all /api/(.*) -> api/index.ts
- Atualizar .vercelignore para nova estrutura
- Resolve: 'No more than 12 Serverless Functions' (Hobby plan)"

$commitBody = @{
    message = $commitMessage
    tree = $tree.sha
    parents = @($lastSha)
} | ConvertTo-Json

$commit = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/commits" `
    -Headers $headers `
    -Body $commitBody `
    -ContentType "application/json"
Write-Host "  Commit SHA: $($commit.sha)" -ForegroundColor Gray

# Update branch ref
Write-Host "`n[6/6] Atualizando branch $branch..." -ForegroundColor Yellow
$refBody = @{sha=$commit.sha; force=$true} | ConvertTo-Json
$result = Invoke-RestMethod -Method Patch `
    -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" `
    -Headers $headers `
    -Body $refBody `
    -ContentType "application/json"

Write-Host "`n=== DEPLOY CONCLUIDO COM SUCESSO! ===" -ForegroundColor Green
Write-Host "Commit: $($commit.sha)" -ForegroundColor Cyan
Write-Host "URL: https://github.com/$repo/commit/$($commit.sha)" -ForegroundColor Cyan
Write-Host "Arquivos enviados: $fileCount" -ForegroundColor Green
Write-Host "Arquivos deletados: $($filesToDelete.Count)" -ForegroundColor Red
Write-Host "`nA Vercel iniciara o deploy automaticamente em ~30s" -ForegroundColor Yellow
