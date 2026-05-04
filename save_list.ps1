
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

$files = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/?ref=dev" -Headers $headers
$output = foreach ($f in $files) { "$($f.path) | $($f.sha)" }
$output | Out-File "files_list.txt"
Write-Host "Lista salva em files_list.txt"
