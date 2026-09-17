const { extractRSCText, extractJsonValueByKey } = require("./extractRSC");

const MARKET_URL = "https://www.analiticafantasy.com/fantasy-la-liga/mercado";

const FETCH_HEADERS = {
  // Un user-agent "normal" de navegador; algunos sitios devuelven una
  // versión distinta (o bloquean) peticiones sin este cabecera.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-ES,es;q=0.9",
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Descarga la página de mercado y devuelve los 575 jugadores tal cual
 * vienen en el array "initialPlayers" embebido en el HTML.
 */
async function fetchRawMarketPlayers() {
  const html = await fetchHtml(MARKET_URL);
  const rscText = extractRSCText(html);
  const result = extractJsonValueByKey(rscText, "initialPlayers");

  if (!result || !Array.isArray(result.value)) {
    throw new Error(
      'No se pudo encontrar/parsear "initialPlayers" en la página de mercado. ' +
        "Es posible que analiticafantasy.com haya cambiado de estructura."
    );
  }

  return result.value;
}

/**
 * Normaliza un jugador crudo del mercado al formato que guardamos en
 * Firestore. Los nombres de campo de origen están confirmados a partir
 * del HTML real de https://www.analiticafantasy.com/fantasy-la-liga/mercado
 * (ver resumen de la sesión). Si el sitio cambia, sólo hay que tocar aquí.
 */
function normalizeMarketPlayer(raw) {
  return {
    slug: raw.slug ?? raw.playerSlug ?? null,
    masterPlayerId: raw.masterPlayerId ?? null,
    nombre: raw.nickname ?? null,
    equipo: raw.teamName ?? null,
    equipoSlug: raw.teamSlug ?? null,
    equipoId: raw.teamId ?? null,
    posicionId: raw.positionId ?? null,
    valorMercado: raw.marketValue ?? null,
    subida: raw.subida ?? 0,
    frenada: raw.frenada ?? null,
    porcentajeTitularidad: raw.titularityPercent ?? null,
    estado: raw.playerStatus ?? null,
    nivelEstado: raw.statusLevel ?? null,
    sancionado: raw.isSanctioned ?? false,
    esNuevo: raw.isNew ?? false,
    temporadaAnterior: raw.lastSeason ?? null,
    temporadaActual: raw.currentSeason ?? null,
  };
}

/**
 * A partir de la lista de jugadores del mercado, deriva la lista única de
 * los 20 equipos (slug + id), que es justo lo que necesitamos para poder
 * construir las URLs de las páginas de equipo (/equipo/{slug}-{id}) sin
 * tener que pedirle al usuario 20 URLs a mano.
 */
function deriveTeamsFromPlayers(rawPlayers) {
  const teamsBySlug = new Map();

  for (const p of rawPlayers) {
    if (!p.teamSlug || p.teamId == null) continue;
    if (!teamsBySlug.has(p.teamSlug)) {
      teamsBySlug.set(p.teamSlug, {
        slug: p.teamSlug,
        id: p.teamId,
        nombre: p.teamName ?? p.teamSlug,
      });
    }
  }

  return Array.from(teamsBySlug.values());
}

/**
 * Función principal: descarga y devuelve { players, teams } ya normalizados.
 */
async function scrapeMarket() {
  const rawPlayers = await fetchRawMarketPlayers();
  const players = rawPlayers.map(normalizeMarketPlayer);
  const teams = deriveTeamsFromPlayers(rawPlayers);

  console.log(
    `[mercado] ${players.length} jugadores descargados, ${teams.length} equipos detectados`
  );

  if (players.length < 400 || teams.length < 18) {
    // Aviso de sanidad: si el mercado tiene ~575 jugadores y 20 equipos,
    // un resultado muy por debajo probablemente significa que la
    // extracción falló parcialmente (cambio de estructura en la web).
    console.warn(
      `[mercado] AVISO: cifras más bajas de lo esperado (jugadores=${players.length}, equipos=${teams.length}). Revisar manualmente.`
    );
  }

  return { players, teams };
}

module.exports = {
  MARKET_URL,
  fetchHtml,
  fetchRawMarketPlayers,
  normalizeMarketPlayer,
  deriveTeamsFromPlayers,
  scrapeMarket,
};
