
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ "Authorization" = "token $token" }

Write-Host "--- INICIANDO DEPLOY UNIFICADO (1 COMMIT) ---" -ForegroundColor Cyan

try {
    # 1. Obter o último commit da branch main
    Write-Host "Obtendo referências do GitHub..."
    $branch = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/main" -Headers $headers
    $parentSha = $branch.commit.sha

    # 2. Coletar arquivos locais (excluindo pastas desnecessárias)
    Write-Host "Coletando arquivos locais..."
    $files = Get-ChildItem -Recurse -File | Where-Object { 
        $_.FullName -notmatch 'node_modules|dist|backups|\.git|\.gemini' 
    }

    $tree = @()
    foreach ($f in $files) {
        $relPath = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
        
        # Criar blob no GitHub para cada arquivo
        # Usamos Base64 para suportar arquivos binários e evitar problemas de encoding
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $base64 = [Convert]::ToBase64String($bytes)
        $blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json
        
        try {
            $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody -ContentType "application/json"
            
            $tree += @{
                path = $relPath
                mode = "100644"
                type = "blob"
                sha = $blob.sha
            }
            Write-Host "[+] Blob: $relPath" -ForegroundColor Gray
        } catch {
            Write-Host "[!] Erro ao criar blob para $relPath : $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # 3. Criar a nova árvore (Tree)
    Write-Host "Criando árvore no GitHub..."
    $treeBody = @{ tree = $tree } | ConvertTo-Json -Depth 100
    $newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody -ContentType "application/json"

    # 4. Criar o commit unificado
    Write-Host "Criando commit..."
    $commitBody = @{ 
        message = "feat: unified deploy v6.2.2 - includes UI fixes and TS corrections"
        tree = $newTree.sha
        parents = @($parentSha) 
    } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody -ContentType "application/json"

    # 5. Atualizar o ponteiro da branch (dispara o build do Vercel uma única vez)
    Write-Host "Atualizando branch main..."
    $refBody = @{ sha = $newCommit.sha; force = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/main" -Headers $headers -Body $refBody -ContentType "application/json"

    Write-Host "`n--- DEPLOY FINALIZADO COM SUCESSO EM UM ÚNICO COMMIT ---" -ForegroundColor Green
    Write-Host "Vercel iniciará o build agora."
} catch {
    Write-Host "`n[FATAL] Ocorreu um erro durante o deploy: $($_.Exception.Message)" -ForegroundColor Red
}
