const { extractRSCText, extractJsonValueByKey } = require("./extractRSC");
const { fetchHtml } = require("./scrapeMarket");

const BASE_TEAM_URL = "https://www.analiticafantasy.com/equipo";

function teamUrl(team) {
  return `${BASE_TEAM_URL}/${team.slug}-${team.id}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normaliza un jugador del bloque de alineación (lineupBlock.home/away)
 * de la página de un equipo concreto.
 */
function normalizeLineupPlayer(raw) {
  const extras = raw.playerExtras ?? {};
  return {
    playerId: raw.playerId ?? null,
    slug: raw.slug ?? null,
    nombre: raw.name ?? null,
    posicionId: raw.positionId ?? null,
    grid: raw.grid ?? null,
    porcentajeTitularidad: raw.chance ?? null,
    esTitular: raw.esTitular ?? null,
    puntosEsperados: raw.predictedFantasyPoints ?? null,
    estado: extras.status ?? null,
    estadoInfo: extras.statusInfo ?? null,
    parte: extras.report ?? null,
    fechaInicioLesion: extras.injuryStartDate ?? null,
  };
}

/**
 * Descarga y parsea la página de un equipo concreto, devolviendo la lista
 * combinada de jugadores (local + visitante, tal y como los devuelve
 * lineupBlock.home / lineupBlock.away) ya normalizados.
 */
async function scrapeTeam(team) {
  const url = teamUrl(team);
  const html = await fetchHtml(url);
  const rscText = extractRSCText(html);
  const result = extractJsonValueByKey(rscText, "lineupBlock");

  if (!result || !result.value) {
    throw new Error(
      `No se pudo encontrar/parsear "lineupBlock" en ${url}. ` +
        "Es posible que analiticafantasy.com haya cambiado de estructura, o que este equipo no juegue la próxima jornada."
    );
  }

  const block = result.value;
  const homePlayers = block.home?.players ?? [];
  const awayPlayers = block.away?.players ?? [];

  const players = [
    ...homePlayers.map((p) => ({ ...normalizeLineupPlayer(p), esLocal: true })),
    ...awayPlayers.map((p) => ({ ...normalizeLineupPlayer(p), esLocal: false })),
  ];

  return {
    equipoSlug: team.slug,
    equipoId: team.id,
    equipoNombre: team.nombre,
    jugadores: players,
  };
}

/**
 * Recorre todos los equipos (derivados del mercado) uno a uno, con una
 * pequeña pausa entre peticiones para no bombardear el sitio. Si un
 * equipo falla, se registra el error pero no se interrumpe el resto
 * (para no perder los 19 equipos restantes por un fallo puntual).
 */
async function scrapeAllTeams(teams, { delayMs = 800 } = {}) {
  const results = [];
  const errors = [];

  for (const team of teams) {
    try {
      const data = await scrapeTeam(team);
      console.log(
        `[equipo] ${team.nombre} (${team.slug}): ${data.jugadores.length} jugadores`
      );
      results.push(data);
    } catch (err) {
      console.error(`[equipo] ERROR en ${team.nombre} (${team.slug}): ${err.message}`);
      errors.push({ team, error: err.message });
    }
    await sleep(delayMs);
  }

  if (errors.length > 0) {
    console.warn(
      `[equipo] AVISO: ${errors.length} equipo(s) fallaron: ${errors
        .map((e) => e.team.slug)
        .join(", ")}`
    );
  }

  return { results, errors };
}

module.exports = {
  teamUrl,
  normalizeLineupPlayer,
  scrapeTeam,
  scrapeAllTeams,
};
