const assert = require("assert");
const { extractRSCText, extractJsonValueByKey } = require("./extractRSC");

// Construimos un HTML sintético que imita EXACTAMENTE el formato real:
// self.__next_f.push([1,"<fragmento con comillas internas escapadas>"])
// generándolo con JSON.stringify (igual que hace Next.js en el servidor),
// para no cometer errores manuales de escapado en el test.

function buildPush(id, fragmentObjOrRaw) {
  const fragment =
    typeof fragmentObjOrRaw === "string"
      ? fragmentObjOrRaw
      : JSON.stringify(fragmentObjOrRaw);
  const pushArg = JSON.stringify([1, `${id}:${fragment}`]);
  return `<script>self.__next_f.push(${pushArg})</script>\n`;
}

// --- Test 1: mercado (initialPlayers) ---
const marketPayload = {
  marketMeta: { totalPlayers: 2 },
  initialPlayers: [
    {
      nickname: 'Test "Nickname"',
      marketValue: 5000000,
      subida: -120000,
      teamSlug: "barcelona",
      teamId: 529,
      titularityPercent: 87,
    },
    {
      nickname: "Otro Jugador",
      marketValue: 3000000,
      subida: 50000,
      teamSlug: "real-madrid",
      teamId: 1,
      titularityPercent: 40,
    },
  ],
};

let html = buildPush("a", { foo: 1 }); // ruido irrelevante antes
html += buildPush("b", marketPayload); // el bueno
html += buildPush("c", { bar: [1, 2, 3] }); // ruido irrelevante después

const rscText = extractRSCText(html);
const marketResult = extractJsonValueByKey(rscText, "initialPlayers");

assert.ok(marketResult, "debería encontrar initialPlayers");
assert.strictEqual(marketResult.value.length, 2);
assert.strictEqual(marketResult.value[0].nickname, 'Test "Nickname"');
assert.strictEqual(marketResult.value[1].teamSlug, "real-madrid");
console.log("OK: extracción de initialPlayers (mercado)");

// --- Test 2: equipo (lineupBlock) ---
const teamPayload = {
  someOtherField: true,
  lineupBlock: {
    home: {
      players: [
        { playerId: 111, name: "Jugador A", chance: 92, esTitular: true, grid: "1x1" },
      ],
    },
    away: {
      players: [
        { playerId: 222, name: "Jugador B", chance: 15, esTitular: false, grid: "2x3" },
      ],
    },
  },
};

let html2 = buildPush("x", { noise: "value with \\ backslash and \"quotes\"" });
html2 += buildPush("y", teamPayload);

const rscText2 = extractRSCText(html2);
const teamResult = extractJsonValueByKey(rscText2, "lineupBlock");

assert.ok(teamResult, "debería encontrar lineupBlock");
assert.strictEqual(teamResult.value.home.players[0].name, "Jugador A");
assert.strictEqual(teamResult.value.away.players[0].chance, 15);
console.log("OK: extracción de lineupBlock (equipo)");

console.log("\nTodos los tests pasaron correctamente.");
