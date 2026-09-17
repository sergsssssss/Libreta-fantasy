const admin = require("firebase-admin");

let appInitialized = false;

/**
 * Inicializa firebase-admin a partir del contenido del secret de GitHub
 * Actions FIREBASE_SERVICE_ACCOUNT (el JSON completo de la cuenta de
 * servicio, tal cual se descarga desde Firebase console, pegado como
 * valor del secret).
 */
function initFirebase() {
  if (appInitialized) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT (el JSON de la cuenta de servicio de Firebase)."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT no contiene un JSON válido: " + err.message
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  appInitialized = true;
}

/**
 * Escribe en Firestore:
 *  - market/{slug}                un documento por jugador del mercado
 *  - market/_meta                 metadatos (fecha de actualización, totales)
 *  - probabilidades/{equipoSlug}  un documento por equipo, con su lista de jugadores
 *  - probabilidades/_meta         metadatos
 *
 * Usa batched writes (máx. 500 operaciones por batch) para no exceder los
 * límites de Firestore.
 */
async function writeToFirestore({ marketPlayers, teamResults }) {
  initFirebase();
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await runInBatches(
    db,
    marketPlayers
      .filter((p) => p.slug) // sin slug no podemos usarlo como ID de documento
      .map((p) => ({
        ref: db.collection("market").doc(p.slug),
        data: { ...p, actualizadoEn: now },
      }))
  );

  await db.collection("market").doc("_meta").set({
    actualizadoEn: now,
    totalJugadores: marketPlayers.length,
  });

  await runInBatches(
    db,
    teamResults.map((t) => ({
      ref: db.collection("probabilidades").doc(t.equipoSlug),
      data: {
        equipoSlug: t.equipoSlug,
        equipoId: t.equipoId,
        equipoNombre: t.equipoNombre,
        jugadores: t.jugadores,
        actualizadoEn: now,
      },
    }))
  );

  await db.collection("probabilidades").doc("_meta").set({
    actualizadoEn: now,
    totalEquipos: teamResults.length,
  });

  console.log(
    `[firestore] Escritos ${marketPlayers.length} jugadores de mercado y ${teamResults.length} equipos.`
  );
}

async function runInBatches(db, ops, chunkSize = 450) {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const op of chunk) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

module.exports = { initFirebase, writeToFirestore };
