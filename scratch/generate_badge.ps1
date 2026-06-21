Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(96, 96)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# Set rendering quality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$g.Clear([System.Drawing.Color]::Transparent)

# Use Segoe UI (standard Windows font) or Arial
$font = New-Object System.Drawing.Font("Segoe UI", 58, [System.Drawing.FontStyle]([System.Drawing.FontStyle]::Bold -bor [System.Drawing.FontStyle]::Italic))
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect = New-Object System.Drawing.RectangleF(0, 0, 96, 96)
$g.DrawString("F", $font, $brush, $rect, $sf)

$targetPath = Join-Path (Get-Item .).FullName "public/badge.png"
$bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$g.Dispose()
$brush.Dispose()
$font.Dispose()
Write-Host "Badge generated successfully at $targetPath"
