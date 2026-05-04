
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

Write-Host "--- LISTANDO BRANCHES ---"
try {
    $branches = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/branches" -Headers $headers
    foreach ($b in $branches) {
        Write-Host "Branch: $($b.name)"
    }
}
catch { Write-Host "Erro ao listar branches: $_" }

Write-Host "`n--- LISTANDO ARQUIVOS NA RAIZ (dev) ---"
try {
    $files = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/?ref=dev" -Headers $headers
    foreach ($f in $files) {
        Write-Host "Arquivo: $($f.name) | SHA: $($f.sha)"
    }
}
catch { Write-Host "Erro ao listar arquivos raiz dev: $_" }
