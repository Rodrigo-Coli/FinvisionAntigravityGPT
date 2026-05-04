
$repo = "Rodrigo-Coli/FinvisionAntigravityGPT"
$token = "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"
$headers = @{ 
    Authorization = "token $token" 
    Accept = "application/vnd.github.v3+json"
}
$branch = "main"

# Auto-bump version.json so UpdateAlert fires for users with old version open
$now = Get-Date -Format "yyyy.MM.dd.HHmm"
$versionContent = "{ `"version`": `"$now`" }`n"
Set-Content -Path "public\version.json" -Value $versionContent -Encoding UTF8
Write-Host "=== FinVision Pro - Deploy Atomico ===" -ForegroundColor Cyan
Write-Host "Repositorio: $repo" -ForegroundColor Gray
Write-Host "Branch: $branch | Versao: $now" -ForegroundColor Gray

# Get current HEAD SHA
Write-Host "`n[1/5] Obtendo SHA do commit atual..." -ForegroundColor Yellow
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/$branch" -Headers $headers
$lastSha = $ref.object.sha
Write-Host "  SHA atual: $lastSha" -ForegroundColor Gray

# Collect ALL files to deploy
$paths = @(
    "pages", "components", "services", "lib", "contexts", 
    "hooks", "utils", "api", "public", "supabase", "server", "src",
    "index.html", "App.tsx", "index.tsx", "main.tsx",
    "types.ts", "package.json", "vite.config.ts", 
    "vercel.json", "tsconfig.json", "tailwind.config.js",
    "postcss.config.js", "index.css", ".vercelignore"
)

Write-Host "`n[2/5] Coletando arquivos..." -ForegroundColor Yellow
$treeItems = @()
$localApiFiles = @()
$fileCount = 0

foreach ($p in $paths) {
    if (Test-Path $p) {
        $files = if ((Get-Item $p).PSIsContainer) { 
            Get-ChildItem -Path $p -Recurse -File 
        } else { 
            Get-Item $p 
        }
        
        foreach ($f in $files) {
            # Skip node_modules, dist, .git, backups, and temp files
            if ($f.FullName -match "node_modules|\\dist\\|\.git\\|_backup|backups\\|\.gemini") { continue }
            
            # Include relevant file types
            if ($f.Extension -match "\.(ts|tsx|js|jsx|json|html|css|svg|png|jpg|jpeg|md|sql|ps1)$") {
                $rel = $f.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
                Write-Host "  + $rel" -ForegroundColor DarkGray
                
                try {
                    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
                    $blobBody = @{content=$b64; encoding="base64"} | ConvertTo-Json
                    $blob = Invoke-RestMethod -Method Post `
                        -Uri "https://api.github.com/repos/$repo/git/blobs" `
                        -Headers $headers `
                        -Body $blobBody `
                        -ContentType "application/json"
                    
                    $treeItems += @{path=$rel; mode="100644"; type="blob"; sha=$blob.sha}
                    $fileCount++
$localApiFiles += $rel
                } catch {
                    Write-Host "  ERRO no arquivo $rel : $_" -ForegroundColor Red
                }
            }
        }
    }
}

Write-Host "`n  Total de arquivos: $fileCount" -ForegroundColor Green

# Create tree
Write-Host "`n[3/5] Criando tree no GitHub..." -ForegroundColor Yellow
$treeBody = @{base_tree=$lastSha; tree=$treeItems} | ConvertTo-Json -Depth 10
$tree = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/trees" `
    -Headers $headers `
    -Body $treeBody `
    -ContentType "application/json"
Write-Host "  Tree SHA: $($tree.sha)" -ForegroundColor Gray

# Create commit
Write-Host "`n[4/5] Criando commit..." -ForegroundColor Yellow
$commitMessage = "feat: wizard imobiliário (planta/pronto), correção fuso horário e bottom-nav
- Wizard imobiliário finalizado com suporte a atos múltiplos, balões e indexação (INCC/IPCA)
- Correção de bug no agrupamento mensal (Abril) via parsing de string (anti-timezone shift)
- Adicionadas configurações de personalização da barra de navegação inferior
- Melhorias no console administrativo: gestão de usuários, auditoria Asaas e edição de prompts"

$commitBody = @{
    message = $commitMessage
    tree = $tree.sha
    parents = @($lastSha)
} | ConvertTo-Json

$commit = Invoke-RestMethod -Method Post `
    -Uri "https://api.github.com/repos/$repo/git/commits" `
    -Headers $headers `
    -Body $commitBody `
    -ContentType "application/json"
Write-Host "  Commit SHA: $($commit.sha)" -ForegroundColor Gray

# Update branch ref
Write-Host "`n[5/5] Atualizando branch $branch..." -ForegroundColor Yellow
$refBody = @{sha=$commit.sha; force=$true} | ConvertTo-Json
$result = Invoke-RestMethod -Method Patch `
    -Uri "https://api.github.com/repos/$repo/git/refs/heads/$branch" `
    -Headers $headers `
    -Body $refBody `
    -ContentType "application/json"

Write-Host "`n=== DEPLOY CONCLUIDO COM SUCESSO! ===" -ForegroundColor Green
Write-Host "Commit: $($commit.sha)" -ForegroundColor Cyan
Write-Host "URL: https://github.com/$repo/commit/$($commit.sha)" -ForegroundColor Cyan
Write-Host "Arquivos enviados: $fileCount" -ForegroundColor Green

