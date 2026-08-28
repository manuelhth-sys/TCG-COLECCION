# Genera docs/data/cards.json y docs/img/**/*.jpg a partir de Cartas/ y la API de optcgapi.com
# Ejecutar desde la raiz del proyecto (APK/) con: powershell -File scripts/generate-data.ps1
# Usar -Refresh para volver a descargar los datos de la API (por ejemplo, cuando sale un set nuevo)

param([switch]$Refresh)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root        = Split-Path -Parent $PSScriptRoot
$cartasDir   = Join-Path $root "Cartas"
$buildDir    = Join-Path $root "build"
$apiJsonPath = Join-Path $buildDir "allSetCards.json"
$docsDir     = Join-Path $root "docs"
$imgOutDir   = Join-Path $docsDir "img"
$dataOutDir  = Join-Path $docsDir "data"

# Sets que la app va a mostrar. Cualquier otro prefijo encontrado en Cartas/ (ST, PRB, P, etc.) se ignora.
$INCLUDE_SET_PATTERN = '^(OP\d{2}|EB0[1-4])$'

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

$lookup = @{}
foreach ($entry in $apiData) {
    $key = $entry.card_image_id
    if (-not $lookup.ContainsKey($key)) { $lookup[$key] = $entry }
}
Write-Host "Registros indexados: $($lookup.Count)"

# ---- Paso 1: indexar todos los .png/.jpg que ya existen en Cartas/, sin importar la carpeta ----
Write-Host "Indexando imagenes locales existentes..."
$existingById = @{}
Get-ChildItem -Path $cartasDir -Recurse -File -Include *.png, *.jpg | ForEach-Object {
    $id = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    if (-not $existingById.ContainsKey($id)) { $existingById[$id] = $_.FullName }
}
Write-Host "Imagenes locales encontradas: $($existingById.Count)"

# ---- Paso 2: descargar las imagenes de EB01-EB04 que falten localmente ----
$ebIds = $lookup.Keys | Where-Object { $_ -match '^EB0[1-4]-' }
$toDownload = $ebIds | Where-Object { -not $existingById.ContainsKey($_) }
Write-Host "Cartas EB01-EB04 en la API: $($ebIds.Count) / faltan localmente: $($toDownload.Count)"

$downloaded = 0
foreach ($id in $toDownload) {
    $entry = $lookup[$id]
    if (-not $entry.card_image) { continue }
    if ($id -match '^([A-Z0-9]+)-') { $setName = $Matches[1] } else { continue }

    $setDir = Join-Path $cartasDir $setName
    New-Item -ItemType Directory -Force -Path $setDir | Out-Null

    $ext = [System.IO.Path]::GetExtension($entry.card_image)
    if ([string]::IsNullOrEmpty($ext)) { $ext = ".jpg" }
    $destPath = Join-Path $setDir ("$id$ext")

    try {
        Invoke-WebRequest -Uri $entry.card_image -OutFile $destPath -TimeoutSec 30 -UseBasicParsing
        $existingById[$id] = $destPath
        $downloaded++
        if ($downloaded % 25 -eq 0) { Write-Host "  descargadas $downloaded / $($toDownload.Count)" }
    } catch {
        Write-Warning "No se pudo descargar $id ($($entry.card_image)): $($_.Exception.Message)"
    }
}
Write-Host "Descarga completa. Nuevas imagenes: $downloaded"

# ---- Paso 3: procesar TODAS las imagenes indexadas (locales originales + recien descargadas) ----
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

function Parse-CardNumber {
    param([string]$id)
    if ($id -match '^([A-Z0-9]+)-(\d+)(?:_p(\d+))?$') {
        return @{ Set = $Matches[1]; Number = [int]$Matches[2]; Variant = $(if ($Matches[3]) { "p$($Matches[3])" } else { "base" }) }
    }
    return $null
}

$cards = New-Object System.Collections.Generic.List[object]
$missingInApi = 0
$skippedOther = 0
$ids = $existingById.Keys | Sort-Object
$total = $ids.Count
$done = 0

foreach ($id in $ids) {
    $parsed = Parse-CardNumber -id $id
    if (-not $parsed) { $skippedOther++; continue }
    if ($parsed.Set -notmatch $INCLUDE_SET_PATTERN) { $skippedOther++; continue }

    $srcPath = $existingById[$id]
    $outSetDir = Join-Path $imgOutDir $parsed.Set
    New-Item -ItemType Directory -Force -Path $outSetDir | Out-Null
    $destJpg = Join-Path $outSetDir ("$id.jpg")
    if (-not (Test-Path $destJpg)) {
        Resize-CardImage -srcPath $srcPath -destPath $destJpg
    }

    $info = $lookup[$id]
    if ($info) {
        $name   = $info.card_name
        $color  = $info.card_color
        $type   = $info.card_type
        $rarity = $info.rarity
        $cost   = $info.card_cost
        $power  = $info.card_power
        $price  = $info.market_price
    } else {
        $name = $id; $color = $null; $type = $null; $rarity = $null; $cost = $null; $power = $null; $price = $null
        $missingInApi++
    }

    $cards.Add([PSCustomObject]@{
        id      = $id
        set     = $parsed.Set
        number  = $parsed.Number
        variant = $parsed.Variant
        name    = $name
        color   = $color
        type    = $type
        rarity  = $rarity
        cost    = $cost
        power   = $power
        price   = $price
        img     = "img/$($parsed.Set)/$id.jpg"
    })

    $done++
    if ($done % 300 -eq 0) { Write-Host "  procesadas $done / $total" }
}

$cardsJsonPath = Join-Path $dataOutDir "cards.json"
$json = $cards | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($cardsJsonPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Listo. Cartas incluidas: $($cards.Count). Sin datos en API: $missingInApi. Ignoradas (otros productos): $skippedOther"
Write-Host "Archivo generado: $cardsJsonPath"
