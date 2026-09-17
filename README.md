# libreta-scraper

Scraper automático (GitHub Actions) que mantiene actualizadas en Firestore
las colecciones `market` y `probabilidades` de **La Libreta de
PajaroAzulGayola**, leyendo datos de [analiticafantasy.com](https://www.analiticafantasy.com).

No usa navegador headless ni API oculta: analiticafantasy.com (Next.js)
incluye todos los datos ya estructurados dentro del propio HTML inicial
(en bloques `self.__next_f.push(...)`), así que una simple petición HTTP
por página basta.

## Qué descarga

1. **Mercado** (`https://www.analiticafantasy.com/fantasy-la-liga/mercado`):
   los 575 jugadores con su valor de mercado, subida/bajada, % de
   titularidad, equipo, estado, etc. Todo llega en una sola petición
   (la paginación de "58 páginas" que se ve en el navegador es sólo
   visual, no hace falta simular clics).
2. **Probabilidades por equipo** (`https://www.analiticafantasy.com/equipo/{slug}-{id}`):
   los 20 equipos se detectan automáticamente a partir de los propios
   datos del mercado (cada jugador trae `teamSlug`/`teamId`), así que no
   hace falta mantener una lista manual de URLs de equipos.

## Estructura

```
scraper/
  extractRSC.js      extractor genérico del "RSC stream" de Next.js
  scrapeMarket.js     descarga y normaliza el mercado + deriva los 20 equipos
  scrapeTeams.js      descarga y normaliza la alineación probable de cada equipo
  writeFirestore.js   escribe los resultados en Firestore (firebase-admin)
  index.js            orquesta todo lo anterior
  extractRSC.test.js  test unitario del extractor (con datos sintéticos)
.github/workflows/scrape.yml   workflow programado + ejecutable a mano
```

## Configuración (una sola vez)

1. En el repo de GitHub, ve a **Settings → Secrets and variables →
   Actions → New repository secret**.
2. Nombre: `FIREBASE_SERVICE_ACCOUNT`.
3. Valor: pega el **contenido completo** del JSON de la cuenta de
   servicio de Firebase que ya descargaste (el mismo que usarías para
   inicializar `firebase-admin`). No subas ese archivo al repositorio,
   sólo pégalo como secret.

Con eso ya está: el workflow se ejecuta solo cada 6 horas.

## Probarlo manualmente

En GitHub, pestaña **Actions → Scraper La Libreta → Run workflow**.
Puedes marcar la casilla "Ejecutar en modo prueba" (`dry_run`) para que
descargue y muestre los datos en los logs **sin escribir nada en
Firestore** — útil para comprobar que la extracción sigue funcionando
si analiticafantasy.com cambia de estructura.

Para ejecutarlo en local (requiere Node 20+):

```bash
npm install
DRY_RUN=1 npm run scrape        # sólo prueba, no toca Firestore
npm run scrape                   # ejecución real (necesita FIREBASE_SERVICE_ACCOUNT en el entorno)
```

## Qué escribe en Firestore

- `market/{slug}` — un documento por jugador del mercado.
- `market/_meta` — fecha de la última actualización y total de jugadores.
- `probabilidades/{equipoSlug}` — un documento por equipo con su lista de
  jugadores y probabilidad de titularidad.
- `probabilidades/_meta` — fecha de la última actualización y total de
  equipos.

Estos campos son mi mejor estimación de un esquema razonable; si el
front-end ya espera nombres de campo distintos, es cuestión de ajustar
`normalizeMarketPlayer` / `normalizeLineupPlayer` en los scrapers
correspondientes — el resto del pipeline no cambia.

## Si el sitio cambia de estructura

Si `analiticafantasy.com` rediseña sus páginas, lo más probable es que
falle la búsqueda de `"initialPlayers"` o `"lineupBlock"` en el HTML. El
scraper avisa explícitamente con un error claro en los logs (no falla en
silencio). En ese caso, habría que volver a pegar el código fuente
actualizado de una página de ejemplo para ajustar `extractRSC.js` /
`scrapeMarket.js` / `scrapeTeams.js`.
