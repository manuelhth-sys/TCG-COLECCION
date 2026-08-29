# Genera docs/data/pokemon-cards.json a partir de la API publica pokemontcg.io
# Ejecutar desde la raiz del proyecto (APK/) con: powershell -File scripts/generate-pokemon-data.ps1
# Usar -Refresh para volver a descargar todo desde cero (por ejemplo, cuando sale un set nuevo)
#
# A diferencia de One Piece, aca no se guardan copias locales de las imagenes:
# se usan directamente las URLs del CDN oficial (images.pokemontcg.io), que ya
# vienen optimizadas. El service worker las cachea en el celular la primera
# vez que se ven, para que despues funcionen offline igual que las de One Piece.

param([switch]$Refresh)

$ErrorActionPreference = "Stop"

$root        = Split-Path -Parent $PSScriptRoot
$buildDir    = Join-Path $root "build"
$setsPath    = Join-Path $buildDir "pokemonSets.json"
$cardsRawDir = Join-Path $buildDir "pokemonCardsRaw"
$docsDir     = Join-Path $root "docs"
$dataOutDir  = Join-Path $docsDir "data"
$outPath     = Join-Path $dataOutDir "pokemon-cards.json"

New-Item -ItemType Directory -Force -Path $buildDir     | Out-Null
New-Item -ItemType Directory -Force -Path $cardsRawDir  | Out-Null
New-Item -ItemType Directory -Force -Path $dataOutDir   | Out-Null

if ($Refresh -and (Test-Path $cardsRawDir)) {
    Remove-Item -Path (Join-Path $cardsRawDir "*.json") -Force -ErrorAction SilentlyContinue
}

function Invoke-ApiJson {
    param([string]$Uri, [int]$MaxRetries = 12)
    $attempt = 0
    while ($true) {
        $attempt++
        try {
            $resp = Invoke-WebRequest -Uri $Uri -TimeoutSec 60 -UseBasicParsing -Headers @{ "Accept" = "application/json" }
            return $resp.Content | ConvertFrom-Json
        } catch {
            if ($attempt -ge $MaxRetries) { throw }
            $wait = [Math]::Min(60, [Math]::Pow(2, $attempt))
            Write-Warning "Fallo ($($_.Exception.Message)) en intento $attempt para $Uri -> reintentando en ${wait}s"
            Start-Sleep -Seconds $wait
        }
    }
}

# ---- Paso 1: sets (una sola pagina, hoy son ~174) ----
Write-Host "Descargando lista de sets..."
if ($Refresh -or -not (Test-Path $setsPath)) {
    $setsResp = Invoke-ApiJson -Uri "https://api.pokemontcg.io/v2/sets?pageSize=250"
    $setsJson = $setsResp.data | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($setsPath, $setsJson, (New-Object System.Text.UTF8Encoding($false)))
}
$sets = Get-Content $setsPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "Sets encontrados: $($sets.Count)"

$setLookup = @{}
foreach ($s in $sets) { $setLookup[$s.id] = $s }

# ---- Paso 2: cartas, paginadas de a 250. Cada pagina se cachea en build/ ----
Write-Host "Descargando cartas (paginado)..."
$pageSize = 250
$page = 1
$totalCount = $null
$allCards = New-Object System.Collections.Generic.List[object]

while ($true) {
    $pagePath = Join-Path $cardsRawDir ("page-{0:D4}.json" -f $page)
    if (Test-Path $pagePath) {
        $data = Get-Content $pagePath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $uri = "https://api.pokemontcg.io/v2/cards?pageSize=$pageSize&page=$page"
        $resp = Invoke-ApiJson -Uri $uri
        $totalCount = $resp.totalCount
        if ($totalCount) { Write-Host "  (total reportado por la API: $totalCount)" }
        $data = $resp.data
        $json = $data | ConvertTo-Json -Depth 8
        [System.IO.File]::WriteAllText($pagePath, $json, (New-Object System.Text.UTF8Encoding($false)))
        Start-Sleep -Milliseconds 400
    }
    if (-not $data -or $data.Count -eq 0) { break }
    foreach ($c in $data) { $allCards.Add($c) }
    Write-Host "  pagina $page -> $($data.Count) cartas (acumulado: $($allCards.Count))"
    if ($data.Count -lt $pageSize) { break }
    $page++
}
Write-Host "Total de cartas descargadas: $($allCards.Count)"

# ---- Paso 3: precio -> mejor esfuerzo entre tcgplayer y cardmarket ----
$TCG_PRICE_PRIORITY = @("normal", "holofoil", "reverseHolofoil", "1stEditionHolofoil", "1stEditionNormal", "unlimitedHolofoil", "unlimited")

function Get-CardPrice {
    param($card)
    if ($card.tcgplayer -and $card.tcgplayer.prices) {
        foreach ($key in $TCG_PRICE_PRIORITY) {
            $p = $card.tcgplayer.prices.$key
            if ($p -and $p.market) { return [double]$p.market }
        }
        foreach ($prop in $card.tcgplayer.prices.PSObject.Properties) {
            if ($prop.Value.market) { return [double]$prop.Value.market }
        }
    }
    if ($card.cardmarket -and $card.cardmarket.prices -and $card.cardmarket.prices.averageSellPrice) {
        return [double]$card.cardmarket.prices.averageSellPrice
    }
    return $null
}

# ---- Paso 4: aplanar al esquema que usa la app ----
Write-Host "Procesando cartas..."
$cards = New-Object System.Collections.Generic.List[object]
foreach ($c in $allCards) {
    $setInfo = $setLookup[$c.set.id]
    $types = if ($c.types) { ($c.types -join "/") } else { $null }

    $cards.Add([PSCustomObject]@{
        id           = $c.id
        set          = $c.set.id
        setName      = $c.set.name
        series       = $c.set.series
        releaseDate  = $setInfo.releaseDate
        number       = $c.number
        printedTotal = $c.set.printedTotal
        name         = $c.name
        supertype    = $c.supertype
        types        = $types
        rarity       = $c.rarity
        price        = Get-CardPrice -card $c
        img          = $c.images.small
        imgLarge     = $c.images.large
    })
}

$json = $cards | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Listo. Cartas incluidas: $($cards.Count) en $($setLookup.Count) sets."
Write-Host "Archivo generado: $outPath"
