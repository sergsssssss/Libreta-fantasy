const { scrapeMarket } = require("./scrapeMarket");
const { scrapeAllTeams } = require("./scrapeTeams");
// writeFirestore (y su dependencia firebase-admin) se cargan de forma
// perezosa más abajo, sólo si NO estamos en DRY_RUN: así se puede probar
// la extracción sin tener firebase-admin instalado.

/**
 * DRY_RUN=1 permite ejecutar el scraper sin escribir en Firestore (útil
 * para probar la extracción en GitHub Actions antes de dar por buena la
 * escritura real, o si aún no se ha configurado el secret de Firebase).
 */
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`=== Scraper La Libreta — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log("(modo DRY_RUN: no se escribirá en Firestore)");

  const { players: marketPlayers, teams } = await scrapeMarket();

  const { results: teamResults, errors: teamErrors } = await scrapeAllTeams(teams);

  console.log(
    `\nResumen: ${marketPlayers.length} jugadores de mercado, ${teamResults.length}/${teams.length} equipos con probabilidades OK.`
  );

  if (DRY_RUN) {
    console.log("\nMuestra de un jugador de mercado:");
    console.log(JSON.stringify(marketPlayers[0], null, 2));
    if (teamResults[0]) {
      console.log("\nMuestra de un equipo:");
      console.log(
        JSON.stringify(
          { ...teamResults[0], jugadores: teamResults[0].jugadores.slice(0, 2) },
          null,
          2
        )
      );
    }
    console.log("\nDRY_RUN activo: no se ha escrito nada en Firestore.");
    return;
  }

  const { writeToFirestore } = require("./writeFirestore");
  await writeToFirestore({ marketPlayers, teamResults });

  if (teamErrors.length > 0) {
    // No hacemos fallar todo el job por un equipo puntual, pero sí
    // devolvemos código de salida distinto de 0 para que quede reflejado
    // en el resumen de GitHub Actions.
    console.error(
      `\nAVISO: terminado con ${teamErrors.length} equipo(s) fallidos. Revisa los logs de arriba.`
    );
    process.exitCode = 1;
  } else {
    console.log("\nTerminado sin errores.");
  }
}

main().catch((err) => {
  console.error("ERROR FATAL en el scraper:", err);
  process.exitCode = 1;
});
