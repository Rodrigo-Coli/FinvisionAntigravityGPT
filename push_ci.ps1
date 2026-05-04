$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$envFile = Join-Path (Get-Location).Path ".env"
$token = $null
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile | Where-Object { $_ -match "^GITHUB_TOKEN=" }
    if ($envContent) {
        $token = ($envContent -split "=", 2)[1].Trim()
    }
}
if (-not $token) {
    $token = "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"
}

$headers = @{
    "Authorization" = "token $token"
    "Accept"        = "application/vnd.github.v3+json"
}

# Verificar se o repo existe e token funciona
try {
    $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $headers
    Write-Host "Repo encontrado: $($repoInfo.full_name)"
}
catch {
    Write-Host "ERRO ao acessar repo: $($_.Exception.Message)"
    exit 1
}

# Buscar último commit na main
$refInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/main" -Headers $headers
$lastCommitSha = $refInfo.object.sha
Write-Host "Ultimo commit: $lastCommitSha"

# Buscar tree do ultimo commit
$commitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits/$lastCommitSha" -Headers $headers
$baseTreeSha = $commitInfo.tree.sha

# Conteudo do ci.yml
$ciContent = @"
name: FinVision Tests CI

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --run
"@

# Criar blob
$bytes = [System.Text.Encoding]::UTF8.GetBytes($ciContent)
$base64 = [Convert]::ToBase64String($bytes)
$blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json
$blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody -ContentType "application/json"
Write-Host "Blob criado: $($blob.sha)"

# Criar tree com o novo arquivo
$treeBody = @{
    base_tree = $baseTreeSha
    tree      = @(
        @{
            path = ".github/workflows/ci.yml"
            mode = "100644"
            type = "blob"
            sha  = $blob.sha
        }
    )
} | ConvertTo-Json -Depth 5

$newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody -ContentType "application/json"
Write-Host "Tree criada: $($newTree.sha)"

# Criar commit
$commitBody = @{
    message = "ci: add GitHub Actions test workflow"
    tree    = $newTree.sha
    parents = @($lastCommitSha)
} | ConvertTo-Json
$newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody -ContentType "application/json"
Write-Host "Commit criado: $($newCommit.sha)"

# Atualizar ref
$refBody = @{ sha = $newCommit.sha; force = $true } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/main" -Headers $headers -Body $refBody -ContentType "application/json" | Out-Null
Write-Host ""
Write-Host "CI workflow enviado com sucesso!"
Write-Host "Acesse: https://github.com/$repo/actions"
