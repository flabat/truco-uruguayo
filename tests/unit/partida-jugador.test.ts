import assert from "node:assert/strict";
import test from "node:test";
import { proyectarTercetos } from "../../api/partidas-tercetos.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline, type AccionOnline, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import { normalizarPartida } from "../../src/motor/partida-jugador.ts";
import { esRepartoOnline } from "../../src/motor/reparto.ts";
import { dueloMazo } from "../fixtures/duelo-mazo.ts";
import pico from "../fixtures/pico-tercetos-v2.json" with { type: "json" };

const puntos: [number, number] = [0, 0];
const marcador = { version: 1, manoNumero: 1, puntos, meta: 40, ganadorPartida: null };

test("la vista previa al reparto omite el lance en los tres modos, incluso al leer una respuesta anterior", () => {
  for (const formato of ["duel", "pairs", "pairs-private-senas", "triples"] as const) {
    const anterior = { ...marcador, version: 0, manoNumero: 0, formato, vista: null };
    const esperada = { ...anterior, contexto: { versionVista: 1, fase: "sin-repartir" } };
    assert.deepEqual(normalizarPartida(anterior), esperada);
    assert.deepEqual(normalizarPartida(normalizarPartida(anterior)), esperada);
  }
});

function jugar(estado: EstadoOnline, accion: AccionOnline) {
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok);
  return paso.estado;
}

test("el lance simple conserva las cartas propias al cerrar y la fase distingue al equipo cero ganador", () => {
  const reparto = { ...dueloMazo.reparto, dador: 1, mano: 0 } as const;
  const inicio = iniciarOnline(reparto);
  function rechazarTruco(estado: EstadoOnline) {
    return jugar(jugar(estado, { tipo: "truco", asiento: 0 }), { tipo: "no-quiero", asiento: 1 });
  }
  const cierre = rechazarTruco(inicio);
  const fin = rechazarTruco(iniciarOnline(reparto, [39, 0], 40));
  for (const [estado, fase] of [
    [inicio, "en-juego"], [cierre, "reparto-cerrado"], [fin, "chico-terminado"],
  ] as const) {
    for (const asiento of [0, 1] as const) {
      const vista = vistaOnline(estado, asiento);
      const puntos = marcadorOnline(estado);
      const anterior = { ...marcador, puntos, ganadorPartida: puntos[0] === 40 ? 0 as const : null, vista };
      const normal = normalizarPartida(anterior);
      assert.deepEqual(normal.lance, { tipo: "simple", duelo: null, activos: [0, 1] });
      assert.deepEqual(normal.contexto, { versionVista: 1, fase });
      assert.deepEqual(normal.vista.cartas, dueloMazo.reparto.manos[asiento]);
      assert.equal(normal.vista, vista);
      assert.deepEqual(normalizarPartida(normal), normal);
    }
  }
});

test("el contexto del pico y su cierre anticipado se recuperan con la vista autorizada de cada asiento", () => {
  const reparto: unknown = pico.reparto;
  assert.ok(esRepartoOnline(reparto));
  let estado = iniciarOnline(reparto, [12, 11], pico.meta, pico.numero);
  function comprobar() {
    for (const asiento of [0, 1, 2, 3, 4, 5] as const) {
      const actual = proyectarTercetos(estado, pico.numero, 9, asiento);
      const { contexto, ...anterior } = actual;
      assert.deepEqual(contexto, { versionVista: 1, fase: estado.resultado ? "chico-terminado" : "en-juego" });
      assert.deepEqual(actual.lance, estado.lance);
      assert.deepEqual(normalizarPartida(anterior), actual);
      if (estado.resultado || !actual.lance.activos.includes(asiento)) {
        assert.equal("cartas" in actual.vista || "tantosPropios" in actual.vista, false);
        assert.deepEqual(actual.vista.legales, []);
      }
    }
  }
  comprobar();
  for (const accion of pico.acciones) {
    estado = jugar(estado, accion as AccionOnline);
    comprobar();
  }
  assert.ok(estado.resultado);
});
