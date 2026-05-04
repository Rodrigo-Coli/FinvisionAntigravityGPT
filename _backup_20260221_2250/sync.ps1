
try {
    $repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
    $token = "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"
    $headers = @{ Authorization = "token $token" }
    
    Write-Host "Verificando repositório: $repo"
    $res = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $headers
    Write-Host "Conectado com sucesso!"

    $files = @(
        "pages/Settings.tsx",
        "pages/AIModule.tsx",
        "pages/Accounts.tsx",
        "pages/CreditCards.tsx",
        "pages/History.tsx",
        "pages/Assets.tsx",
        "pages/Reconcile.tsx",
        "pages/AdminUsers.tsx",
        "pages/Home.tsx",
        "components/Nav.tsx",
        "services/aiReconcile.service.ts",
        "services/dashboard.service.ts",
        "services/reconciliation.service.ts",
        "services/finance.service.ts",
        "services/ai.service.ts",
        "services/geminiLive.service.ts",
        "types.ts",
        "index.html",
        "index.tsx",
        "App.tsx",
        "lib/supabase/client.ts",
        "package.json",
        "vite.config.ts",
        "vercel.json"
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
                message = "Fix: Credit Card Payment Flow, Automatic Statement Creation and Decimal Precision"
                content = $base64
            }
            if ($sha) { $body.sha = $sha }

            $json = $body | ConvertTo-Json
            Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
            Write-Host "Sucesso: $relPath"
        }
    }
    Write-Host "`n--- TUDO SINCRONIZADO! ---"
}
catch {
    Write-Host "ERRO: $_"
}
