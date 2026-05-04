
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    $branch = "dev"

    function Update-File($relPath) {
        $filePath = Join-Path (Get-Location).Path $relPath
        if (Test-Path $filePath) {
            Write-Host "Trabalhando em: $relPath"
            
            # Pegar SHA de forma limpa
            $sha = ""
            try {
                $uri = "https://api.github.com/repos/$repo/contents/$relPath?ref=$branch"
                $res = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction Stop
                $sha = $res.sha
                Write-Host "  -> SHA atual: $sha"
            }
            catch {
                Write-Host "  -> Arquivo não existe na branch ou erro: $_"
            }

            $content = [System.IO.File]::ReadAllBytes($filePath)
            $base64 = [Convert]::ToBase64String($content)
            
            $body = @{
                message = "Fix: Clean up index.html and revert Babel"
                content = $base64
                branch  = $branch
            }
            if ($sha) { $body.sha = $sha }

            $json = $body | ConvertTo-Json
            Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
            Write-Host "  -> Sincronizado com sucesso!`n"
        }
    }

    Update-File "index.html"
    Update-File "pages/Settings.tsx"
    Update-File "pages/AIModule.tsx"
    Update-File "services/aiReconcile.service.ts"
    Update-File "types.ts"
    Update-File "vercel.json"
}
catch {
    Write-Host "ERRO GERAL: $_"
}
