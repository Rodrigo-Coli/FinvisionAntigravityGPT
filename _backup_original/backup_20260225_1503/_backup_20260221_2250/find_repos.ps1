
try {
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    
    Write-Host "Buscando seus repositórios no GitHub..."
    $repos = Invoke-RestMethod -Uri "https://api.github.com/user/repos?per_page=100" -Headers $headers
    
    Write-Host "`nRepositórios encontrados:"
    foreach ($r in $repos) {
        Write-Host "- $($r.full_name)"
    }
}
catch {
    Write-Host "ERRO ao buscar repositórios: $_"
}
