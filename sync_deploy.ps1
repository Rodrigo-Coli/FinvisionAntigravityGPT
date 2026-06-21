
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ "Authorization" = "token $token" }

Write-Host "--- INICIANDO DEPLOY UNIFICADO (MIRROR LOCAL -> GITHUB) ---" -ForegroundColor Cyan

try {
    # 1. Obter o último commit da branch main
    Write-Host "Obtendo referências do GitHub..."
    $branch = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/main" -Headers $headers
    $parentSha = $branch.commit.sha

    # 2. Coletar arquivos locais (excluindo pastas de build e sistema)
    Write-Host "Coletando arquivos locais..."
    $excludeDir = 'node_modules|dist|backups|\.git|\.gemini|_backup'
    $files = Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch $excludeDir }

    $tree = @()
    foreach ($f in $files) {
        $relPath = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
        Write-Host "Criando blob para: $relPath" -ForegroundColor Gray
        
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
        } catch {
            Write-Host "[!] Erro no arquivo $relPath : $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # 3. Criar a nova árvore (Tree) - SEM base_tree para garantir que o GitHub seja um espelho fiel do local
    Write-Host "Criando árvore no GitHub..."
    $treeBody = @{ tree = $tree } | ConvertTo-Json -Depth 100
    $newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody -ContentType "application/json"

    # 4. Criar o commit unificado
    Write-Host "Criando commit..."
    $commitBody = @{ 
        message = "fix(notification): implement redirection filters, status bar badge icon, and whatsapp webhook transaction resolution/date validation"
        tree = $newTree.sha
        parents = @($parentSha) 
    } | ConvertTo-Json
    $newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody -ContentType "application/json"

    # 5. Atualizar o ponteiro da branch
    Write-Host "Atualizando branch main..."
    $refBody = @{ sha = $newCommit.sha; force = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/main" -Headers $headers -Body $refBody -ContentType "application/json"

    Write-Host "`n--- DEPLOY FINALIZADO COM SUCESSO EM UM ÚNICO COMMIT (MIRROR) ---" -ForegroundColor Green
    Write-Host "Vercel iniciará o build agora."
} catch {
    Write-Host "`n[FATAL] Ocorreu um erro durante o deploy: $($_.Exception.Message)" -ForegroundColor Red
}
