/**
 * extractRSC.js
 *
 * analiticafantasy.com está construido con Next.js (App Router) y renderiza
 * sus datos como un "RSC stream": el HTML inicial incluye, dentro de varias
 * etiquetas <script>, llamadas del tipo:
 *
 *   self.__next_f.push([1,"1a:[{\"nickname\":\"...\", ...}]"])
 *
 * Cada llamada es en sí misma un array JSON válido `[id, "texto"]`, donde
 * "texto" es un fragmento del árbol de props de React, con las comillas
 * internas escapadas. Al unir y desescapar todos esos fragmentos obtenemos
 * un texto plano en el que aparecen, sin necesidad de ejecutar JS ni de
 * usar un navegador, las estructuras de datos que nos interesan:
 *   - "initialPlayers":[...]   -> página de mercado (575 jugadores completos)
 *   - "lineupBlock":{...}      -> página de equipo (probabilidades de once)
 *
 * Este módulo concentra la lógica genérica de extracción para no repetirla
 * en cada scraper.
 */

/**
 * Recorre el HTML y devuelve el texto concatenado de todos los fragmentos
 * self.__next_f.push([...]) encontrados, en el orden en que aparecen.
 */
function extractRSCText(html) {
  const marker = "self.__next_f.push(";
  let text = "";
  let searchFrom = 0;

  while (true) {
    const start = html.indexOf(marker, searchFrom);
    if (start === -1) break;

    const argStart = start + marker.length; // debería apuntar a "["
    const argEnd = findBalancedEnd(html, argStart, "[", "]");
    if (argEnd === -1) {
      // No se pudo balancear correctamente; seguimos buscando más adelante
      searchFrom = argStart;
      continue;
    }

    const rawArg = html.slice(argStart, argEnd + 1);
    searchFrom = argEnd + 1;

    try {
      const parsed = JSON.parse(rawArg); // [id, "fragmento escapado"]
      if (Array.isArray(parsed) && typeof parsed[1] === "string") {
        text += parsed[1];
      }
    } catch (err) {
      // Algunos pushes no son parseables directamente (p.ej. contienen
      // referencias tipo $L14); los ignoramos, no afectan al resto.
    }
  }

  return text;
}

/**
 * A partir de una posición donde se espera el carácter de apertura `openCh`,
 * devuelve el índice del carácter de cierre `closeCh` que lo balancea,
 * respetando cadenas de texto ("...") y sus escapes internos.
 * Devuelve -1 si no lo encuentra.
 */
function findBalancedEnd(text, openIndex, openCh, closeCh) {
  if (text[openIndex] !== openCh) {
    // Puede haber espacios en blanco antes del carácter esperado
    while (openIndex < text.length && /\s/.test(text[openIndex])) openIndex++;
    if (text[openIndex] !== openCh) return -1;
  }

  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\") {
        i++; // saltar el carácter escapado
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Busca la primera aparición de "clave": dentro de un texto y extrae el
 * valor JSON completo que la sigue (objeto {} o array []), balanceando
 * correctamente llaves/corchetes anidados y cadenas de texto.
 * Devuelve el valor ya parseado (objeto/array JS), o null si no se encontró.
 *
 * fromIndex permite buscar apariciones posteriores a una ya usada.
 */
function extractJsonValueByKey(text, key, fromIndex = 0) {
  const needle = `"${key}":`;
  const keyIndex = text.indexOf(needle, fromIndex);
  if (keyIndex === -1) return null;

  let valueStart = keyIndex + needle.length;
  while (valueStart < text.length && /\s/.test(text[valueStart])) valueStart++;

  const ch = text[valueStart];
  let openCh, closeCh;
  if (ch === "{") {
    openCh = "{";
    closeCh = "}";
  } else if (ch === "[") {
    openCh = "[";
    closeCh = "]";
  } else {
    // Valor primitivo (no debería darse para las claves que usamos)
    return null;
  }

  const valueEnd = findBalancedEnd(text, valueStart, openCh, closeCh);
  if (valueEnd === -1) return null;

  const rawValue = text.slice(valueStart, valueEnd + 1);
  try {
    return { value: JSON.parse(rawValue), endIndex: valueEnd };
  } catch (err) {
    return null;
  }
}

module.exports = {
  extractRSCText,
  extractJsonValueByKey,
  findBalancedEnd,
};
