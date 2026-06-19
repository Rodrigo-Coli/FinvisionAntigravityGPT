try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $branch = "main"
    $token = "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"
    $headers = @{ 
        "Authorization" = "token $token"
        "Accept"        = "application/vnd.github.v3+json"
    }

    $files = @(
        "types.ts", "App.tsx", "index.tsx", "index.html", "package.json", "package-lock.json", "vite.config.ts", "vercel.json", "tailwind.config.js", "postcss.config.js", "tsconfig.json", "tsconfig.node.json", "index.css"
    )

    $foldersToSearch = @("lib", "pages", "services", "contexts", "components", "api", "server", "supabase/functions")

    foreach ($folder in $foldersToSearch) {
        if (Test-Path $folder) {
            $folderFiles = Get-ChildItem -Path $folder -Recurse -File | Where-Object { $_.Extension -match "\.(tsx|ts|sql|js|css)$" } | Select-Object -ExpandProperty FullName
            foreach ($f in $folderFiles) {
                $rel = $f.Replace((Get-Location).Path + "\", "").Replace("\", "/")
                $files += $rel
            }
        }
    }
    
    # Adding known supabase files
    $files += "supabase/master_migration.sql"
    $files += "supabase/clear_data.sql"
    $files += "supabase/functions/parse-import/index.ts"

    # Remove duplicates
    $files = $files | Select-Object -Unique

    Write-Host "Total de arquivos a sincronizar: $($files.Count)"
    Write-Host "INICIANDO DEPLOY ATOMICO"

    $branchInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches/$branch" -Headers $headers
    $baseTreeSha = $branchInfo.commit.commit.tree.sha
    $parentCommitSha = $branchInfo.commit.sha

    $treeItems = @()
    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $blobBody = @{ content = $base64; encoding = "base64" } | ConvertTo-Json -Depth 10
            $blobResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body $blobBody
            
            $treeItems += @{
                path = $relPath.Replace("\", "/")
                mode = "100644"
                type = "blob"
                sha  = $blobResponse.sha
            }
        }
    }

    Write-Host "Tree..."
    $treeBody = @{ base_tree = $baseTreeSha; tree = $treeItems } | ConvertTo-Json -Depth 10
    $newTreeResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body $treeBody

    Write-Host "Commit..."
    $commitBody = @{
        message = "Feature: AI Categorization Engine & Seamless Landing Page dynamic deploy sync"
        tree    = $newTreeResponse.sha
        parents = @($parentCommitSha)
    } | ConvertTo-Json -Depth 10
    $newCommitResponse = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body $commitBody

    Write-Host "Ref..."
    $refBody = @{ sha = $newCommitResponse.sha; force = $true } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body $refBody

    Write-Host "DEPLOY OK! A Vercel iniciará o build de produção automaticamente."
}
catch {
    $msg = $_.Exception.Message
    Write-Host "ERRO: $msg"
}
