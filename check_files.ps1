
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

Write-Host "--- FILES ON DEV ROOT ---"
$files = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/?ref=dev" -Headers $headers
foreach ($f in $files) {
    Write-Host "$($f.path) | $($f.sha)"
}
