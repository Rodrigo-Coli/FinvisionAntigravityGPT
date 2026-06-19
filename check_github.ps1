$token = "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"
$headers = @{
    Authorization = "token $token"
    Accept        = "application/vnd.github.v3+json"
}

# Check if HistoryFilters.tsx exists on GitHub
try {
    $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/Rodrigo-Coli/FinvisionAntigravityGPT/contents/components/history/HistoryFilters.tsx" -Headers $headers
    Write-Host "HistoryFilters.tsx - Size: $($resp.size) bytes"
}
catch {
    Write-Host "HistoryFilters.tsx NOT FOUND on GitHub: $_"
}

# Check last commit
$commits = Invoke-RestMethod -Uri "https://api.github.com/repos/Rodrigo-Coli/FinvisionAntigravityGPT/commits?per_page=3" -Headers $headers
foreach ($c in $commits) {
    Write-Host "Commit: $($c.sha.Substring(0,8)) | $($c.commit.committer.date) | $($c.commit.message.Substring(0, [Math]::Min(80, $c.commit.message.Length)))"
}
