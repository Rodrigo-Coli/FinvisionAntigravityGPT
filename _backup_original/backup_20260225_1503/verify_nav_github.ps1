
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

Write-Host "--- VERIFICANDO ARQUIVO NAV NO GITHUB ---"
try {
    $file = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/components/Nav.tsx" -Headers $headers
    $content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($file.content))
    
    if ($content -match "aside" -and $content -match "Sidebar Desktop") {
        Write-Host "[OK] O Nav.tsx no GitHub contém a estrutura de SIDEBAR."
    }
    else {
        Write-Host "[ERRO] O Nav.tsx no GitHub NÃO contém SIDEBAR!"
    }
}
catch {
    Write-Host "Falha ao consultar arquivo: $_"
}
