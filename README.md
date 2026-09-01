# Mi Coleccion TCG

App web (PWA) para llevar el control de las cartas que tienes y las que te faltan, con tres colecciones separadas: **One Piece Card Game** (sets OP01-OP17, EB01-EB04 y las cartas DON!! promocionales/de arte especial), **Pokemon TCG** (todos los sets, desde Base hasta la expansion mas reciente) y **Dragon Ball Super Card Game: Fusion World** (todos los sets, sin precios por ahora). Funciona en el celular como si fuera una app instalada, con selector de juego, busqueda por nombre/codigo y guardado local del progreso.

## Estructura

- `docs/` - la app en si (esto es lo que se publica en GitHub Pages).
- `Cartas/` - imagenes originales en alta resolucion de One Piece (no se sube al repo, solo se usa localmente para generar las miniaturas).
- `scripts/generate-data.ps1` - escanea `Cartas/`, descarga nombres/colores/rareza de la API publica de optcgapi.com, comprime las imagenes y genera `docs/data/cards.json` + `docs/img/` (One Piece).
- `scripts/generate-pokemon-data.ps1` - descarga el catalogo completo (datos + precios) de la API publica de pokemontcg.io y genera `docs/data/pokemon-cards.json`. Las imagenes de Pokemon NO se copian localmente: se usan las URLs del CDN oficial (`images.pokemontcg.io`) directamente, y el service worker las cachea en el celular la primera vez que se ven para que despues anden offline.
- `scripts/generate-dragonball-data.ps1` - descarga el catalogo de Dragon Ball Super: Fusion World desde un dataset publico en GitHub (sin API key) y genera `docs/data/dragonball-cards.json`. Las imagenes tampoco se copian localmente (se sirven del CDN oficial `dbs-cardgame.com`). Esta fuente no trae precios, asi que todas las cartas quedan con valor $0 por ahora.
- `scripts/generate-icons.ps1` - genera los iconos de la app (`docs/icons/`).
- `scripts/serve.ps1` - levanta un servidor local en `http://localhost:8080` para probar la app antes de publicar.

## Actualizar cuando sale un set nuevo de One Piece (ej. OP18)

1. Copia las imagenes del set nuevo dentro de `Cartas/OP18/` (mismo formato de nombre: `OP18-001.png`, `OP18-001_p1.png`, etc).
2. Ejecuta:
   ```
   powershell -File scripts/generate-data.ps1 -Refresh
   ```
3. Revisa localmente con `powershell -File scripts/serve.ps1` y abre `http://localhost:8080`.
4. Sube los cambios (`git add`, `git commit`, `git push`) - GitHub Pages se actualiza solo.

## Actualizar el catalogo de Pokemon (sets nuevos, precios)

```
powershell -File scripts/generate-pokemon-data.ps1 -Refresh
```

La API publica (pokemontcg.io) es bastante inestable (errores 500/502 intermitentes); el script reintenta cada pagina con backoff y cachea el progreso en `build/pokemonCardsRaw/`, asi que si se corta a la mitad, con volver a correr el mismo comando (sin `-Refresh`) retoma donde quedo en vez de descargar todo de nuevo.

## Actualizar el catalogo de Dragon Ball (sets nuevos)

```
powershell -File scripts/generate-dragonball-data.ps1 -Refresh
```

Cuando Bandai saque un set nuevo hay que agregar su codigo a la lista `$SET_FILES` al principio del script (se puede ver que sets nuevos aparecieron mirando `cards/en/` en https://github.com/apitcg/dragon-ball-fusion-tcg-data).

## Publicar / actualizar en GitHub Pages

1. Crea un repositorio vacio en GitHub (puede ser privado).
2. `git remote add origin <URL-del-repo>`
3. `git push -u origin main`
4. En GitHub: Settings -> Pages -> Source: rama `main`, carpeta `/docs`.
5. Espera 1-2 minutos y entra a la URL que te da GitHub Pages desde el navegador del celular.
6. En Chrome (Android): menu (⋮) -> "Instalar app" / "Anadir a pantalla de inicio".

## Datos

- **One Piece**: nombres, colores y rareza vienen de la API publica y gratuita de [optcgapi.com](https://optcgapi.com). Las imagenes son tus propios archivos locales, solo comprimidos para que la app cargue rapido en el celular.
- **Pokemon**: nombres, tipos, rareza, precios (TCGPlayer/Cardmarket) e imagenes vienen de la API publica y gratuita de [pokemontcg.io](https://pokemontcg.io). Las imagenes se sirven directo desde su CDN (no se guardan copias en el repo).
- **Dragon Ball**: nombres, colores, rareza e imagenes vienen del dataset publico [apitcg/dragon-ball-fusion-tcg-data](https://github.com/apitcg/dragon-ball-fusion-tcg-data) en GitHub, sin necesidad de cuenta ni API key. No incluye precios.
