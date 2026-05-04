
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

$path = "index.html"
$sha = "21bea6630c83201e309357716797dc3af6232907" # Hardcoded based on listing
$content = [System.IO.File]::ReadAllBytes((Join-Path (Get-Location).Path $path))
$base64 = [Convert]::ToBase64String($content)

$body = @{
    message = "Fix: Standard index.html on dev branch"
    content = $base64
    sha     = $sha
    branch  = "dev"
} | ConvertTo-Json

Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$path" -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Index.html atualizado na dev"
