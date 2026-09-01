# Genera docs/data/dragonball-cards.json a partir de un dataset publico y
# gratuito en GitHub (apitcg/dragon-ball-fusion-tcg-data), sin API key ni
# limite de requests. Cubre Dragon Ball Super Card Game: Fusion World.
#
# Ejecutar desde la raiz del proyecto (APK/) con:
#   powershell -File scripts/generate-dragonball-data.ps1
# Usar -Refresh para volver a descargar todo (por ejemplo, cuando sale un set nuevo)
#
# OJO: este dataset no incluye precios. Todas las cartas quedan con price=null
# hasta que aparezca una fuente de precios confiable para Dragon Ball (ver
# notas en el historial del proyecto sobre TCGApi.dev y su cuota gratuita).

param([switch]$Refresh)

$ErrorActionPreference = "Stop"

$root       = Split-Path -Parent $PSScriptRoot
$buildDir   = Join-Path $root "build"
$rawDir     = Join-Path $buildDir "dragonballRaw"
$dataOutDir = Join-Path $root "docs\data"
$outPath    = Join-Path $dataOutDir "dragonball-cards.json"

New-Item -ItemType Directory -Force -Path $rawDir     | Out-Null
New-Item -ItemType Directory -Force -Path $dataOutDir | Out-Null

# Archivos de set conocidos en el dataset (cards/en/*.json). Si Bandai saca un
# set nuevo, agregar su codigo aca cuando aparezca en el repo.
$SET_FILES = @(
    "fb01","fb02","fb03","fb04","fb05","fb06",
    "fs01","fs02","fs03","fs04","fs05","fs06","fs07","fs08","fs09","fs10",
    "promotion","sb01"
)

function Invoke-ApiJson {
    param([string]$Uri, [int]$MaxRetries = 6)
    $attempt = 0
    while ($true) {
        $attempt++
        try {
            $resp = Invoke-WebRequest -Uri $Uri -TimeoutSec 60 -UseBasicParsing
            return $resp.Content
        } catch {
            if ($attempt -ge $MaxRetries) { throw }
            $wait = [Math]::Min(30, [Math]::Pow(2, $attempt))
            Write-Warning "Fallo ($($_.Exception.Message)) en intento $attempt para $Uri -> reintentando en ${wait}s"
            Start-Sleep -Seconds $wait
        }
    }
}

Write-Host "Descargando sets de Dragon Ball Fusion World..."
$allCards = New-Object System.Collections.Generic.List[object]
foreach ($setFile in $SET_FILES) {
    $rawPath = Join-Path $rawDir "$setFile.json"
    if ($Refresh -or -not (Test-Path $rawPath)) {
        $content = Invoke-ApiJson -Uri "https://raw.githubusercontent.com/apitcg/dragon-ball-fusion-tcg-data/main/cards/en/$setFile.json"
        [System.IO.File]::WriteAllText($rawPath, $content, (New-Object System.Text.UTF8Encoding($false)))
        Start-Sleep -Milliseconds 300
    }
    $data = Get-Content $rawPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($c in $data) { $allCards.Add($c) }
    Write-Host "  $setFile -> $($data.Count) cartas"
}
Write-Host "Cartas totales descargadas: $($allCards.Count)"

# Los ids reales de carta (ej. "FB01-001", "E-01", "FP-001-p1") no siempre
# coinciden con el campo "set" que trae el JSON (el archivo promotion.json
# mezcla varias series de promos bajo un solo set.id="promotion"), asi que
# el set de cada carta se deriva de su propio codigo.
function Parse-CardId {
    param([string]$id)
    if ($id -match '^([A-Z]+[0-9]*)-([0-9]+)(?:-p([0-9]+))?$') {
        return @{ Set = $Matches[1]; Number = [int]$Matches[2]; Variant = $(if ($Matches[3]) { "p$($Matches[3])" } else { "base" }) }
    }
    return $null
}

$cards = New-Object System.Collections.Generic.List[object]
$skipped = 0
foreach ($c in $allCards) {
    $parsed = Parse-CardId -id $c.id
    if (-not $parsed) { $skipped++; continue }

    $cost  = if ($c.cost -eq "-") { $null } else { $c.cost }
    $power = if ($c.power -eq "-") { $null } else { $c.power }

    $cards.Add([PSCustomObject]@{
        id       = $c.id
        set      = $parsed.Set
        number   = $parsed.Number
        variant  = $parsed.Variant
        name     = $c.name
        color    = $c.color
        type     = $c.cardType
        rarity   = $c.rarity
        cost     = $cost
        power    = $power
        price    = $null
        img      = $c.images.small
        imgLarge = $c.images.large
    })
}

$json = $cards | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Listo. Cartas incluidas: $($cards.Count). Ignoradas (id no reconocido): $skipped"
Write-Host "Archivo generado: $outPath"
