
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

Write-Host "Iniciando Push para GitHub: $repo ($branch)"

# 1. Pegar o SHA do commit atual
try {
    $ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers
    $lastSha = $ref.object.sha
} catch {
    Write-Host "Erro ao buscar ref: $_"
    exit
}

# 2. Definir caminhos para subir
$paths = @(
    "App.tsx", 
    "pages/CreditCards.tsx", 
    "pages/History.tsx", 
    "pages/Home.tsx",
    "pages/Accounts.tsx",
    "pages/Reconcile.tsx",
    "components/cards/StatementSummary.tsx",
    "services/finance.service.ts", 
    "task.md", 
    "walkthrough.md", 
    "src/sw.js",
    "components/UpdateAlert.tsx",
    "vite-env.d.ts",
    "implementation_plan.md"
)

$treeItems = @()
foreach ($relPath in $paths) {
    if (Test-Path $relPath) {
        Write-Host "Processando: $relPath"
        $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($relPath))
        $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body (@{content=$b64;encoding="base64"} | ConvertTo-Json) -ContentType "application/json"
        $treeItems += @{path=$relPath; mode="100644"; type="blob"; sha=$blob.sha}
    }
}

# 3. Criar Tree
Write-Host "Criando Tree..."
$tree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body (@{tree=$treeItems; base_tree=$lastSha} | ConvertTo-Json -Depth 10) -ContentType "application/json"

# 4. Criar Commit
Write-Host "Criando Commit..."
$message = "feat: full bidirectional sync between card statements and history + UI alignment fixes"
$commit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body (@{message=$message; tree=$tree.sha; parents=@($lastSha)} | ConvertTo-Json) -ContentType "application/json"

# 5. Atualizar Reference
Write-Host "Atualizando Branch..."
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body (@{sha=$commit.sha} | ConvertTo-Json) -ContentType "application/json"

Write-Host "GITHUB ATUALIZADO COM SUCESSO!"
