$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

$filesToDeploy = @(
    "api/_lib/whatsapp-webhook.ts",
    "api/_lib/health.ts",
    "api/_lib/notify-bills-due.ts",
    "pages/Signup.tsx"
)

Write-Host "=== FinVision Pro - Deploy Multi-Arquivo ===" -ForegroundColor Cyan

# 1. Obter SHA do commit atual
Write-Host "[1/5] Obtendo SHA do ultimo commit..." -ForegroundColor Yellow
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
$lastSha = $ref.object.sha
Write-Host "  SHA atual: $lastSha" -ForegroundColor Gray

# 2. Criar os blobs para cada arquivo
Write-Host "[2/5] Criando blobs..." -ForegroundColor Yellow
$treeItems = @()

foreach ($filePath in $filesToDeploy) {
    if (-not (Test-Path $filePath)) {
        Write-Host "Erro: Arquivo nao encontrado! $filePath" -ForegroundColor Red
        exit 1
    }
    
    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($filePath))
    $blobBody = @{content=$b64; encoding="base64"} | ConvertTo-Json
    $blob = Invoke-RestMethod -Method Post `
        -Uri "https://api.github.com/repos/$repo/git/blobs" `
        -Headers $headers `
        -Body $blobBody `
        -ContentType "application/json"
    
    $treeItems += @{
        path = $filePath.Replace("\", "/")
        mode = "100644"
        type = "blob"
        sha = $blob.sha
    }
    Write-Host "  Blob criado para ${filePath} - SHA: $($blob.sha)" -ForegroundColor Gray
}

# 3. Criar nova tree baseada na tree atual
Write-Host "[3/5] Criando nova tree..." -ForegroundColor Yellow
$treeBody = @{
    base_tree = $lastSha
    tree = $treeItems
} | ConvertTo-Json -Depth 5

$tree = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/trees" `
    -Headers $headers `
    -Body $treeBody `
    -ContentType "application/json"
$treeSha = $tree.sha
Write-Host "  Tree SHA: $treeSha" -ForegroundColor Gray

# 4. Criar o commit
Write-Host "[4/5] Criando commit..." -ForegroundColor Yellow
$commitBody = @{
    message = "feat: whatsapp advanced operations and audio transcription opus fix"
    tree = $treeSha
    parents = @($lastSha)
} | ConvertTo-Json

$commit = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/commits" `
    -Headers $headers `
    -Body $commitBody `
    -ContentType "application/json"
$commitSha = $commit.sha
Write-Host "  Commit SHA: $commitSha" -ForegroundColor Gray

# 5. Atualizar a branch
Write-Host "[5/5] Atualizando branch $branch..." -ForegroundColor Yellow
$refBody = @{sha=$commitSha; force=$true} | ConvertTo-Json
$result = Invoke-RestMethod -Method Patch `
    -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" `
    -Headers $headers `
    -Body $refBody `
    -ContentType "application/json"

Write-Host "=== DEPLOY MULTI-ARQUIVO CONCLUIDO COM SUCESSO! ===" -ForegroundColor Green
Write-Host "Commit: $commitSha" -ForegroundColor Cyan
Write-Host "URL: https://github.com/$repo/commit/$commitSha" -ForegroundColor Cyan
