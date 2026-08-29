# OJO: los iconos actuales en docs/icons/ son un diseno custom (no generado por
# este script). Correr esto los pisa con el diseno generico "OP" de abajo.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "docs\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function New-AppIcon {
    param([int]$size, [string]$destPath)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)),
        (New-Object System.Drawing.Point($size,$size)),
        [System.Drawing.Color]::FromArgb(255, 15, 18, 32),
        [System.Drawing.Color]::FromArgb(255, 31, 36, 64)
    )
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    $accent = [System.Drawing.Color]::FromArgb(255, 255, 183, 3)
    $pen = New-Object System.Drawing.Pen($accent, [Math]::Max(2, $size * 0.02))
    $margin = [int]($size * 0.08)
    $g.DrawRectangle($pen, $margin, $margin, $size - 2*$margin, $size - 2*$margin)

    $fontSize = $size * 0.30
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush($accent)
    $text = "OP"
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rectY1 = 0 - ($size * 0.05)
    $rect1 = New-Object System.Drawing.RectangleF(0.0, $rectY1, [float]$size, [float]$size)
    $g.DrawString($text, $font, $brush, $rect1, $sf)

    $font2 = New-Object System.Drawing.Font("Segoe UI", ($size * 0.09), [System.Drawing.FontStyle]::Regular)
    $brush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 222, 245))
    $rectY2 = $size * 0.68
    $rectH2 = $size * 0.2
    $rect2 = New-Object System.Drawing.RectangleF(0.0, [float]$rectY2, [float]$size, [float]$rectH2)
    $g.DrawString("TCG COLLECTION", $font2, $brush2, $rect2, $sf)

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

New-AppIcon -size 192 -destPath (Join-Path $iconsDir "icon-192.png")
New-AppIcon -size 512 -destPath (Join-Path $iconsDir "icon-512.png")
Write-Host "Iconos generados en $iconsDir"
