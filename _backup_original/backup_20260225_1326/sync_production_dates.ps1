
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    
    Write-Host "Iniciando atualização de produção: $repo"
    
    $files = @(
        "lib/dateUtils.ts",
        "lib/historyUtils.ts",
        "pages/Home.tsx",
        "pages/CreditCards.tsx",
        "pages/AdminUsers.tsx",
        "components/ai/OCRScanner.tsx",
        "components/cards/TransactionList.tsx"
    )

    foreach ($relPath in $files) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "Sincronizando: $relPath..."
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $sha = ""
            try {
                $existingFile = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -ErrorAction SilentlyContinue
                $sha = $existingFile.sha
            }
            catch {}

            $body = @{
                message = "Refactor: Standardize date formatting with DateUtils and fix Dashboard dynamic date"
                content = $base64
            }
            if ($sha) { $body.sha = $sha }

            $json = $body | ConvertTo-Json
            Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
            Write-Host "Sucesso: $relPath"
        }
        else {
            Write-Host "Aviso: Arquivo não encontrado localmente: $relPath"
        }
    }
    Write-Host "`n--- PRODUÇÃO ATUALIZADA COM SUCESSO! ---"
}
catch {
    Write-Host "ERRO NA ATUALIZAÇÃO: $_"
}
