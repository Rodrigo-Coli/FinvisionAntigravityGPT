
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }

Write-Host "--- VERIFICANDO ARQUIVO NO GITHUB ---"
try {
    $file = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/App.tsx" -Headers $headers
    $content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($file.content))
    
    if ($content -match "flex-col lg:flex-row") {
        Write-Host "[OK] O App.tsx no GitHub contém a estrutura de SIDEBAR (flex-row)."
    }
    else {
        Write-Host "[ERRO] O App.tsx no GitHub ainda é a versão antiga (Navbar superior)!"
    }
}
catch {
    Write-Host "Falha ao consultar arquivo: $_"
}
