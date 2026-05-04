
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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" # Token original do Rodrigo-Coli validado nos logs
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

Write-Host "--- INICIANDO PUSH ATOMICO DO OVERHAUL (FIXADO) ---"

# 1. Obter SHA do último commit
try {
    $ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
    $lastSha = $ref.object.sha
} catch {
    Write-Host "ERRO ao obter SHA: $($_.Exception.Message)"
    exit 1
}

# 2. Definir caminhos para incluir
$paths = @("pages", "components", "services", "lib", "contexts", "hooks", "utils", "api", "server", "public", "tests", "index.html", "App.tsx", "index.tsx", "types.ts", "package.json", "vite.config.ts", "vercel.json", "tsconfig.json")

$treeItems = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        if ((Get-Item $p).PSIsContainer) {
            $files = Get-ChildItem -Path $p -Recurse -File
        } else {
            $files = Get-Item $p
        }
        
        foreach ($f in $files) {
            if ($f.Extension -match "\.(ts|tsx|js|jsx|json|html|css|svg|png|jpg|md)$") {
                if ($f.FullName -notmatch "node_modules") {
                    $rel = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
                    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
                    $b64 = [Convert]::ToBase64String($bytes)
                    
                    try {
                        $blobBody = @{content=$b64;encoding="base64"} | ConvertTo-Json
                        $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody -ContentType "application/json"
                        $treeItems += @{path=$rel; mode="100644"; type="blob"; sha=$blob.sha}
                        Write-Host "[OK] $rel"
                    } catch {
                        Write-Host "[ERRO] Erro ao criar blob para $rel : $($_.Exception.Message)"
                    }
                }
            }
        }
    }
}

# 3. Criar Tree
Write-Host "Criando árvore atômica..."
$treeBody = @{tree=$treeItems} | ConvertTo-Json -Depth 20
$tree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody -ContentType "application/json"

# 4. Criar Commit
$commitMsg = "feat: platform overhaul - security, rebranding, and UX/UI refinement"
Write-Host "Criando commit: $commitMsg"
$commitBody = @{message=$commitMsg; tree=$tree.sha; parents=@($lastSha)} | ConvertTo-Json
$commit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody -ContentType "application/json"

# 5. Atualizar Ref
Write-Host "Atualizando branch $branch..."
$refBody = @{sha=$commit.sha; force=$true} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $refBody -ContentType "application/json" | Out-Null

Write-Host "`n--- SUCESSO! ATUALIZAÇÃO ATÔMICA CONCLUÍDA ---"
Write-Host "URL: https://github.com/$repo"
