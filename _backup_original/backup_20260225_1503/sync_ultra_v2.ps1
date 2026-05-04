
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$auth = "token $token"
$branch = "dev"

$files = @(
    "index.html",
    "index.tsx",
    "App.tsx",
    "components/Nav.tsx",
    "pages/Settings.tsx",
    "pages/Home.tsx",
    "pages/AIModule.tsx",
    "pages/History.tsx",
    "pages/Reconcile.tsx",
    "pages/Accounts.tsx",
    "pages/CreditCards.tsx",
    "pages/Assets.tsx",
    "pages/AdminUsers.tsx",
    "pages/Login.tsx",
    "pages/Signup.tsx",
    "services/aiReconcile.service.ts",
    "types.ts",
    "package.json",
    "vite.config.ts",
    "vercel.json",
    "lib/supabase/client.ts",
    "api/handle-receipt-items.ts"
)

foreach ($relPath in $files) {
    Write-Host "Sync: $relPath"
    $localPath = Join-Path (Get-Location).Path $relPath
    if (!(Test-Path $localPath)) { continue }

    $headers = @{ "Authorization" = $auth }
    $sha = ""
    
    # Busca SHA na branch dev
    try {
        $url = "https://api.github.com/repos/$repo/contents/$relPath`?ref=$branch"
        $res = Invoke-RestMethod -Uri $url -Headers $headers -ErrorAction SilentlyContinue
        if ($res.sha) { $sha = $res.sha }
    }
    catch {}

    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $b64 = [Convert]::ToBase64String($bytes)
    
    $payload = @{
        message = "Sync Dev Preview"
        content = $b64
        branch  = $branch
    }
    if ($sha) { $payload.sha = $sha }

    $json = $payload | ConvertTo-Json
    try {
        Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
        Write-Host "  -> Sucesso!"
    }
    catch {
        $msg = $_.Exception.Message
        Write-Host "  -> Erro: $msg"
        
        # Se falhou por conflito ou SHA ausente, tenta buscar na MASTER (em caso de ref divergente)
        if ($msg -match "422" -or $msg -match "409") {
            try {
                $url2 = "https://api.github.com/repos/$repo/contents/$relPath"
                $res2 = Invoke-RestMethod -Uri $url2 -Headers $headers
                $payload.sha = $res2.sha
                $json2 = $payload | ConvertTo-Json
                Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json2 -ContentType "application/json"
                Write-Host "  -> Sucesso via fallback SHA!"
            }
            catch {
                Write-Host "  -> Fallback falhou também."
            }
        }
    }
}
