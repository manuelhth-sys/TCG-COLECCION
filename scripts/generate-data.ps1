# Genera docs/data/cards.json y docs/img/**/*.jpg a partir de Cartas/ y la API de optcgapi.com
# Ejecutar desde la raiz del proyecto (APK/) con: powershell -File scripts/generate-data.ps1
# Usar -Refresh para volver a descargar los datos de la API (por ejemplo, cuando sale un set nuevo)

param([switch]$Refresh)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root       = Split-Path -Parent $PSScriptRoot
$cartasDir  = Join-Path $root "Cartas"
$buildDir   = Join-Path $root "build"
$apiJsonPath= Join-Path $buildDir "allSetCards.json"
$docsDir    = Join-Path $root "docs"
$imgOutDir  = Join-Path $docsDir "img"
$dataOutDir = Join-Path $docsDir "data"

New-Item -ItemType Directory -Force -Path $buildDir   | Out-Null
New-Item -ItemType Directory -Force -Path $imgOutDir  | Out-Null
New-Item -ItemType Directory -Force -Path $dataOutDir | Out-Null

if ($Refresh -or -not (Test-Path $apiJsonPath)) {
    Write-Host "Descargando datos de optcgapi.com..."
    $resp = Invoke-WebRequest -Uri "https://optcgapi.com/api/allSetCards/" -TimeoutSec 60 -UseBasicParsing
    [System.IO.File]::WriteAllText($apiJsonPath, $resp.Content, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host "Cargando datos de la API..."
$apiData = Get-Content $apiJsonPath -Raw | ConvertFrom-Json

# Indice: card_image_id -> primer registro cuyo card_set_id empiece con el set correcto
$lookup = @{}
foreach ($entry in $apiData) {
    $key = $entry.card_image_id
    if (-not $lookup.ContainsKey($key)) {
        $lookup[$key] = $entry
    }
}
Write-Host "Registros indexados: $($lookup.Count)"

function Resize-CardImage {
    param([string]$srcPath, [string]$destPath, [int]$maxWidth = 380, [long]$quality = 80)

    $img = [System.Drawing.Image]::FromFile($srcPath)
    try {
        $ratio = $maxWidth / $img.Width
        if ($ratio -gt 1) { $ratio = 1 }
        $newW = [Math]::Max(1, [int]($img.Width * $ratio))
        $newH = [Math]::Max(1, [int]($img.Height * $ratio))

        $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
        try {
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.Clear([System.Drawing.Color]::White)
                $g.DrawImage($img, 0, 0, $newW, $newH)
            } finally { $g.Dispose() }

            $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $quality)
            $bmp.Save($destPath, $jpegCodec, $encParams)
        } finally { $bmp.Dispose() }
    } finally { $img.Dispose() }
}

$cards = New-Object System.Collections.Generic.List[object]
$setDirs = Get-ChildItem -Path $cartasDir -Directory | Sort-Object Name

$totalFiles = 0
foreach ($setDir in $setDirs) { $totalFiles += (Get-ChildItem -Path $setDir.FullName -Filter *.png).Count }
Write-Host "Total de imagenes a procesar: $totalFiles"

$done = 0
$missingInApi = 0

foreach ($setDir in $setDirs) {
    $setName = $setDir.Name
    $outSetDir = Join-Path $imgOutDir $setName
    New-Item -ItemType Directory -Force -Path $outSetDir | Out-Null

    $files = Get-ChildItem -Path $setDir.FullName -Filter *.png | Sort-Object Name
    foreach ($file in $files) {
        $id = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)  # e.g. OP01-001 or OP01-001_p1

        if ($id -match '^([A-Z0-9]+)-(\d+)(?:_p(\d+))?$') {
            $numberPart = $Matches[2]
            $variantIdx = $Matches[3]
        } else {
            $numberPart = $null
            $variantIdx = $null
        }
        $variant = if ($variantIdx) { "p$variantIdx" } else { "base" }
        $number  = if ($numberPart) { [int]$numberPart } else { 0 }

        $info = $lookup[$id]
        if ($info) {
            $name   = $info.card_name
            $color  = $info.card_color
            $type   = $info.card_type
            $rarity = $info.rarity
            $cost   = $info.card_cost
            $power  = $info.card_power
        } else {
            $name   = $id
            $color  = $null
            $type   = $null
            $rarity = $null
            $cost   = $null
            $power  = $null
            $missingInApi++
        }

        $destJpg = Join-Path $outSetDir ("$id.jpg")
        if (-not (Test-Path $destJpg)) {
            Resize-CardImage -srcPath $file.FullName -destPath $destJpg
        }

        $cards.Add([PSCustomObject]@{
            id      = $id
            set     = $setName
            number  = $number
            variant = $variant
            name    = $name
            color   = $color
            type    = $type
            rarity  = $rarity
            cost    = $cost
            power   = $power
            img     = "img/$setName/$id.jpg"
        })

        $done++
        if ($done % 200 -eq 0) { Write-Host "  procesadas $done / $totalFiles" }
    }
}

$cardsJsonPath = Join-Path $dataOutDir "cards.json"
$json = $cards | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($cardsJsonPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Listo. Cartas totales: $($cards.Count). Sin datos en API: $missingInApi"
Write-Host "Archivo generado: $cardsJsonPath"
