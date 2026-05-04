$source = "C:\Users\rodrigo.coli\Documents\Antigravity\FinVision-GPT-main\FinVision-GPT-main"
$backupDir = Join-Path $source "backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$destination = Join-Path $backupDir ("backup_" + $timestamp)

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

New-Item -ItemType Directory -Path $destination | Out-Null

$excludeFolders = @("node_modules", ".git", "dist", ".gemini", "backups", "supabase\.temp")

Get-ChildItem -Path $source | Where-Object { 
    $excludeFolders -notcontains $_.Name 
} | Copy-Item -Destination $destination -Recurse -Force

Write-Host "Backup completed at:" $destination
