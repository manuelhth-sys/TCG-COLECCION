# Mi Coleccion One Piece TCG

App web (PWA) para llevar el control de las cartas de One Piece Card Game que tienes y las que te faltan, organizadas por set (OP01-OP17). Funciona en el celular como si fuera una app instalada, con busqueda por nombre/codigo y guardado local del progreso.

## Estructura

- `docs/` - la app en si (esto es lo que se publica en GitHub Pages).
- `Cartas/` - imagenes originales en alta resolucion (no se sube al repo, solo se usa localmente para generar las miniaturas).
- `scripts/generate-data.ps1` - escanea `Cartas/`, descarga nombres/colores/rareza de la API publica de optcgapi.com, comprime las imagenes y genera `docs/data/cards.json` + `docs/img/`.
- `scripts/generate-icons.ps1` - genera los iconos de la app (`docs/icons/`).
- `scripts/serve.ps1` - levanta un servidor local en `http://localhost:8080` para probar la app antes de publicar.

## Actualizar cuando sale un set nuevo (ej. OP18)

1. Copia las imagenes del set nuevo dentro de `Cartas/OP18/` (mismo formato de nombre: `OP18-001.png`, `OP18-001_p1.png`, etc).
2. Ejecuta:
   ```
   powershell -File scripts/generate-data.ps1 -Refresh
   ```
3. Revisa localmente con `powershell -File scripts/serve.ps1` y abre `http://localhost:8080`.
4. Sube los cambios (`git add`, `git commit`, `git push`) - GitHub Pages se actualiza solo.

## Publicar / actualizar en GitHub Pages

1. Crea un repositorio vacio en GitHub (puede ser privado).
2. `git remote add origin <URL-del-repo>`
3. `git push -u origin main`
4. En GitHub: Settings -> Pages -> Source: rama `main`, carpeta `/docs`.
5. Espera 1-2 minutos y entra a la URL que te da GitHub Pages desde el navegador del celular.
6. En Chrome (Android): menu (⋮) -> "Instalar app" / "Anadir a pantalla de inicio".

## Datos

Los nombres, colores y rareza de las cartas provienen de la API publica y gratuita de [optcgapi.com](https://optcgapi.com). Las imagenes son tus propios archivos locales, solo comprimidos para que la app cargue rapido en el celular.
