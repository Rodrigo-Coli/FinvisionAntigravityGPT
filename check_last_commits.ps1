$token = "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"
$headers = @{
    Authorization = "token $token"
    Accept        = "application/vnd.github.v3+json"
}
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"

Write-Host "Verificando os últimos 5 commits em $repo..."
try {
    $commits = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/commits?per_page=5" -Headers $headers
    foreach ($c in $commits) {
        Write-Host "SHA: $($c.sha.Substring(0,8)) | Data: $($c.commit.committer.date) | Msg: $($c.commit.message)"
    }
}
catch {
    Write-Host "Falha ao verificar commits: $_"
}
