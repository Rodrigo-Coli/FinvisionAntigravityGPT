
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

Write-Host "--- INICIANDO DEPLOY ATOMICO TOTAL (V3) ---"

# 1. Obter SHA
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
$lastSha = $ref.object.sha

# 2. Pastas
$paths = @("pages", "components", "services", "lib", "contexts", "hooks", "utils", "api", "server", "public", "tests", "index.html", "App.tsx", "index.tsx", "types.ts", "package.json", "vite.config.ts", "vercel.json", "tsconfig.json")

$treeItems = @()
foreach ($p in $paths) {
    if (Test-Path $p) {
        $files = if ((Get-Item $p).PSIsContainer) { Get-ChildItem -Path $p -Recurse -File } else { Get-Item $p }
        foreach ($f in $files) {
            if ($f.Extension -match "\.(ts|tsx|js|jsx|json|html|css|svg|png|jpg|md)$") {
                $rel = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
                $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
                $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body (@{content=$b64;encoding="base64"} | ConvertTo-Json) -ContentType "application/json"
                $treeItems += @{path=$rel; mode="100644"; type="blob"; sha=$blob.sha}
                Write-Host "[OK] $rel"
            }
        }
    }
}

# 3. Tree, Commit, Ref
$tree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body (@{tree=$treeItems} | ConvertTo-Json -Depth 10) -ContentType "application/json"
$commit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body (@{message="feat: platform overhaul - security, rebranding, and UX/UI refinement"; tree=$tree.sha; parents=@($lastSha)} | ConvertTo-Json) -ContentType "application/json"
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body (@{sha=$commit.sha; force=$true} | ConvertTo-Json) -ContentType "application/json" | Out-Null

Write-Host "`n--- SUCESSO! ---"
Write-Host "Commit: https://github.com/$repo/commit/$($commit.sha)"
