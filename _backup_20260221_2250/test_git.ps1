
try {
    $repo = "rodrigocoli/finvision-antigravity-gpt"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    
    Write-Host "Verificando repositório: $repo"
    $res = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $headers
    Write-Host "Conectado ao repositório: $($res.full_name)"
}
catch {
    Write-Host "ERRO de conexão: $_"
}
