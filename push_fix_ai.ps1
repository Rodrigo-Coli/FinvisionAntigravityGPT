$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

Write-Host "Fetching last SHA..."
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
$lastSha = $ref.object.sha

# Files specifically changed or critical for this fix
$filesToPush = @(
    "api/index.ts",
    "api/_lib/finvision-chat.ts",
    "api/_lib/health.ts",
    "components/CashFlowProjection.tsx"
)

$treeItems = @()
foreach ($relPath in $filesToPush) {
    if (Test-Path $relPath) {
        Write-Host "Preparing blob for $relPath..."
        $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($relPath))
        $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $headers -Body (@{content=$b64;encoding="base64"} | ConvertTo-Json) -ContentType "application/json"
        $treeItems += @{path=$relPath; mode="100644"; type="blob"; sha=$blob.sha}
    } else {
        Write-Warning "File not found: $relPath"
    }
}

Write-Host "Creating tree..."
$tree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $headers -Body (@{base_tree=$lastSha; tree=$treeItems} | ConvertTo-Json -Depth 10) -ContentType "application/json"

Write-Host "Creating commit..."
$commitMsg = "fix: resolve AI 'Module Not Found' error via static imports and add projection safety"
$commit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $headers -Body (@{message=$commitMsg; tree=$tree.sha; parents=@($lastSha)} | ConvertTo-Json) -ContentType "application/json"

Write-Host "Updating reference..."
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" -Headers $headers -Body (@{sha=$commit.sha; force=$true} | ConvertTo-Json) -ContentType "application/json"

Write-Host "Push completed successfully!"
