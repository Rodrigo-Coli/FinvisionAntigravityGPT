
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ Authorization = "token $token" }
$branch = "dev"

$files = @(
    "index.html",
    "index.tsx",
    "App.tsx",
    "pages/Settings.tsx",
    "pages/AIModule.tsx",
    "services/aiReconcile.service.ts",
    "types.ts",
    "package.json",
    "vite.config.ts",
    "vercel.json",
    "lib/supabase/client.ts"
)

foreach ($relPath in $files) {
    Write-Host "`nProcessando: $relPath"
    $filePath = Join-Path (Get-Location).Path $relPath
    if (!(Test-Path $filePath)) {
        Write-Host "  -> Ignorado (não encontrado localmente)"
        continue
    }

    # Pegar SHA de forma infalível
    $sha = ""
    try {
        # GET sem o 'ref' primeiro para ver o que tem na master/default
        # Mas o melhor é ver na branch alvo
        $uri = "https://api.github.com/repos/$repo/contents/$relPath?ref=$branch"
        $res = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction SilentlyContinue
        if ($res.sha) {
            $sha = $res.sha
            Write-Host "  -> SHA encontrado na branch $branch: $sha"
        }
    }
    catch {
        Write-Host "  -> Erro ao buscar SHA: $_"
    }

    $content = [System.IO.File]::ReadAllBytes($filePath)
    $base64 = [Convert]::ToBase64String($content)
    
    $body = @{
        message = "Robust Sync: Fix Preview Environment"
        content = $base64
        branch  = $branch
    }
    if ($sha) { $body.sha = $sha }

    $json = $body | ConvertTo-Json
    try {
        Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
        Write-Host "  -> SINCERIZADO COM SUCESSO!"
    }
    catch {
        Write-Host "  -> ERRO FATAL: $($_.Exception.Message)"
        # Se der 422 aqui, é porque o SHA está errado ou faltando. 
        # Vou tentar buscar SEM ref (pega da master) caso a branch seja nova e tenha divergido.
        if ($_.Exception.Message -match "422") {
            Write-Host "  -> Tentando fallback de SHA da master..."
            try {
                $resMain = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers
                $body.sha = $resMain.sha
                $json = $body | ConvertTo-Json
                Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$relPath" -Headers $headers -Body $json -ContentType "application/json"
                Write-Host "  -> SINCRONIZADO VIA FALLBACK!"
            }
            catch {
                Write-Host "  -> Fallback falhou: $($_.Exception.Message)"
            }
        }
    }
}
