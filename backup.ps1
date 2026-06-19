$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$src = $PSScriptRoot
if (-not $src) { $src = (Get-Location).Path }
$dest = Join-Path $src "backups\backup_$timestamp"
$excludes = @("node_modules", ".git", "dist", ".gemini", "backups", "_backup_original", "_backup_20260221_2250")

Write-Host "Criando backup em: $dest"
New-Item -Path $dest -ItemType Directory -Force | Out-Null

Get-ChildItem -Path $src -Exclude $excludes | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
}

$count = (Get-ChildItem -Recurse $dest | Measure-Object).Count
Write-Host "Backup concluido! $count arquivos copiados."
