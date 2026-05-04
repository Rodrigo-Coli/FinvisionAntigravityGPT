
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

$path = "pages/Settings.tsx"
$content = [System.IO.File]::ReadAllBytes((Join-Path (Get-Location).Path $path))
$base64 = [Convert]::ToBase64String($content)

$body = @{
    message = "Fix: Add missing Settings.tsx to dev branch"
    content = $base64
    branch  = "dev"
} | ConvertTo-Json

Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$path" -Headers $headers -Body $body -ContentType "application/json"
Write-Host "Settings.tsx criado na dev"
