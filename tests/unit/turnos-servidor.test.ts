import assert from "node:assert/strict";
import test from "node:test";
import { guardarAcciones, jugarComputadoras, leerAccion, restaurar, turnosDeEquipo, type Registro } from "../../api/turnos.ts";
import { hasSignals, signalVersionFor, supportedFormats } from "../../training/contracts/index.ts";
import { iniciarOnline, type RepartoOnline } from "../../src/motor/mesa-online.ts";

const parejas: RepartoOnline = {versionReparto: "online-1", mano: 0, dador: 3, muestra: "oros-01", manos: [
  ["bastos-02","bastos-03","bastos-04"], ["copas-05","copas-06","copas-07"],
  ["copas-02","espadas-01","oros-05"], ["espadas-02","espadas-04","bastos-05"],
]};
test("los clientes envían un gesto reconocido y una jugada, el servidor fija el asiento", () => {
  assert.deepEqual(leerAccion({tipo:"flor",sena:"nariz"}, 2, "pairs-senas"), {tipo:"flor", asiento:2, sena:"nariz"});
  for (const mal of [{tipo:"carta"}, {tipo:"oros-01"}, {tipo:"nariz/truco"}, {tipo:"carta", carta:"inventada"},
    {tipo:"flor",asiento:0}, {sena:"cejas"}, {tipo:"truco",sena:"invalida"}, {tipo:"truco",sena:null}]) {
    assert.throws(() => leerAccion(mal, 0, "pairs-senas"));
  }
  assert.throws(() => leerAccion({tipo:"truco",sena:"cejas"}, 0, "pairs"));
});
test("los comandos persistidos reconstruyen todas las señas y cobros sin volver a consultar al bot", () => {
  for (const formato of supportedFormats) {
    const reparto = formato === "duel" ? {...parejas, dador:1, manos:parejas.manos.slice(0,2)} as RepartoOnline : parejas;
    const estado = iniciarOnline(reparto);
    const inicial = {estado, turnos: []};
    const jugada = jugarComputadoras(inicial, formato, [], true);
    assert.ok(jugada.estado.resultado);
    assert.equal(jugada.turnos[0].action.tipo,"flor");
    assert.deepEqual(jugarComputadoras(inicial, formato, [0]), inicial);
    const fila: Registro = { numero:1, version:1, version_reglas:1,
      version_senas: signalVersionFor(formato),
      reparto, puntos_inicio:[0,0], acciones: guardarAcciones(jugada) };
    const repetida = restaurar(fila, formato);
    assert.deepEqual(repetida, jugada);
    if (hasSignals(formato)) {
      for (const asiento of [0, 1, 2, 3] as const) {
        const visibles = turnosDeEquipo(repetida.turnos, asiento);
        for (const [i, turno] of visibles.entries()) {
          const original = jugada.turnos[i];
          const esperado = original.action.asiento % 2 === asiento % 2 ? original : {action: original.action, awards: original.awards};
          assert.deepEqual(turno, esperado);
        }
      }
    }
    assert.throws(() => restaurar({...fila, version_senas:"futura"}, formato));
    assert.ok(fila.acciones.every(a => Boolean(a.sena) === hasSignals(formato)));
  }
});
