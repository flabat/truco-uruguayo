// Oráculo del segundo ejercicio. Enumeración directa independiente del analizador propuesto.
import assert from "node:assert/strict";
import { mazo } from "@eltruco/motor/cartas.ts";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara } from "@eltruco/motor/mano.ts";
import { versionReparto } from "@eltruco/motor/reparto.ts";

const muestra = "copas-06";
const alternativas = ["copas-02", "oros-05"];
const prefijo = [
  [0, "bastos-03"], [1, "copas-11"], [2, "espadas-04"], [3, "oros-04"],
  [1, "oros-06"], [2, "copas-03"], [3, "copas-05"],
];
const conocidas = [0, 1, 2, 3].map(asiento =>
  prefijo.filter(([jugador]) => jugador === asiento).map(([, carta]) => carta));
conocidas[0].push(...alternativas);
const fijas = new Set([muestra, ...conocidas.flat()]);
const libres = mazo.filter(carta => !fijas.has(carta));

function tirar(estado, asiento, carta) {
  const paso = jugarCarta(estado, { asiento, carta });
  assert.ok(paso.ok, "El fixture contiene una jugada ilegal");
  return paso.estado;
}

function reconstruir(manos) {
  let estado = iniciarMano({ versionReparto, semilla: 0, dador: 3, mano: 0, muestra, manos });
  for (const [asiento, carta] of prefijo) {
    if (asiento !== 0 && elegirJugada(vistaPara(estado, asiento)) !== carta) return null;
    estado = tirar(estado, asiento, carta);
  }
  return estado;
}

function ganaLaPareja(estado, carta) {
  let actual = tirar(estado, 0, carta);
  while (actual.turno !== null) {
    const asiento = actual.turno;
    actual = tirar(actual, asiento, elegirJugada(vistaPara(actual, asiento)));
  }
  return actual.equipoGanador === 0;
}

let asignaciones = 0;
let compatibles = 0;
const resultados = { ambas: 0, soloDos: 0, soloCinco: 0, ninguna: 0 };
for (const derecha of libres) {
  for (const frente of libres) {
    if (frente === derecha) continue;
    for (const izquierda of libres) {
      if (izquierda === derecha || izquierda === frente) continue;
      asignaciones++;
      const estado = reconstruir([
        conocidas[0], [...conocidas[1], derecha], [...conocidas[2], frente], [...conocidas[3], izquierda],
      ]);
      if (!estado) continue;
      compatibles++;
      const [conDos, conCinco] = alternativas.map(carta => ganaLaPareja(estado, carta));
      if (conDos && conCinco) resultados.ambas++;
      else if (conDos) resultados.soloDos++;
      else if (conCinco) resultados.soloCinco++;
      else resultados.ninguna++;
    }
  }
}

assert.equal(asignaciones, 24360);
assert.equal(compatibles, 1175);
assert.deepEqual(resultados, { ambas: 0, soloDos: 692, soloCinco: 0, ninguna: 483 });
console.log(JSON.stringify({ asignaciones, compatibles, resultados }, null, 2));
