import assert from "node:assert/strict";
import test from "node:test";
import { crearMesaGuiada } from "../../src/aprendizaje/mano-guiada.ts";
import { crearFuenteProgreso, progresoDe } from "../../src/aprendizaje/progreso.ts";
import { vistaPara } from "@eltruco/motor/mano.ts";
import { reproducirReplay } from "@eltruco/motor/replay.ts";
import { evaluarTantos } from "@eltruco/motor/tantos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";

function almacenamiento() {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); } };
}

function pestaña(semilla: number) {
  const almacen = almacenamiento();
  const fuente = crearFuenteProgreso(() => almacenamiento());
  return { fuente, abrir: () => crearMesaGuiada({ semilla: () => semilla, fuente, obtenerAlmacen: () => almacen }) };
}

function resolver(mesa: ReturnType<typeof crearMesaGuiada>) {
  const { cartas, muestra } = mesa.vista().mesa;
  const tantos = evaluarTantos(cartas, muestra);
  assert.ok(mesa.responder({ tipo: "decidir-flor", hayFlor: tantos.modalidad === "flor" }));
  assert.ok(mesa.responder({ tipo: "elegir-cartas", cartas: tantos.desgloses[0].aportes.map((a) => a.carta) }));
  assert.ok(mesa.responder({ tipo: "responder-total", total: tantos.total }));
}

test("la pista y la recarga conservan paso, turno y evidencia de una misma situación", () => {
  const { abrir, fuente } = pestaña(830838);
  let mesa = abrir();
  const paginaAnterior = mesa;
  const inicial = mesa.vista().mesa;
  assert.equal(inicial.mano, 0);
  assert.deepEqual(inicial.cartas, ["copas-02", "oros-05", "bastos-03"]);
  assert.equal(inicial.muestra, "copas-06");
  assert.equal(mesa.jugar("bastos-03"), false);
  assert.equal(mesa.responder({ tipo: "decidir-flor", hayFlor: true }), false);
  mesa.pedirPista();
  const pausa = mesa.vista();
  mesa = abrir();
  assert.deepEqual(mesa.vista(), pausa);
  assert.equal(mesa.responder({ tipo: "decidir-flor", hayFlor: false }), true);
  assert.equal(mesa.responder({ tipo: "elegir-cartas", cartas: ["oros-05", "copas-02"] }), true);
  mesa = abrir();
  assert.deepEqual(mesa.vista().mesa, inicial);
  assert.deepEqual(mesa.vista().seleccion, ["oros-05", "copas-02"]);
  assert.equal(mesa.responder({ tipo: "responder-total", total: 35 }), true);
  assert.equal(progresoDe(fuente.actual, "reconocer-flor").casos[0].acreditado, false);
  const cuenta = progresoDe(fuente.actual, "contar-envido");
  assert.deepEqual(cuenta.ultimosResultados, [true, true]);
  assert.equal(cuenta.casos[0].acreditado, true);
  assert.ok(paginaAnterior.reanudar());
  assert.deepEqual(paginaAnterior.vista(), mesa.vista());
  assert.equal(mesa.jugar("bastos-01"), false);
  assert.deepEqual(mesa.vista().mesa, inicial);
});

for (const salida of ["copas-02", "oros-05", "bastos-03"] as const) {
  test(`la salida ${salida} se juega hasta el cierre y cada prefijo reconstruye la vista del aprendiz`, () => {
    const { abrir, fuente } = pestaña(830838);
    const mesa = abrir();
    resolver(mesa);
    const evidencia = fuente.actual;
    assert.ok(mesa.jugar(salida));
    assert.equal(mesa.vista().mesa.vueltas[0].jugadas[0].carta, salida);
    while (mesa.vista().mesa.turno !== null) assert.ok(mesa.jugar(mesa.vista().mesa.cartas[0]));
    const final = mesa.vista().mesa;
    const jugadas = final.vueltas.flatMap((v) => v.jugadas);
    if (salida === "bastos-03") {
      assert.deepEqual(jugadas.map((j) => j.carta), ["bastos-03", "bastos-01", "bastos-06", "bastos-12",
        "espadas-02", "oros-02", "oros-03", "copas-02", "oros-05", "copas-07", "bastos-07", "copas-01"]);
      assert.equal(final.equipoGanador, 1);
    }
    for (let i = 0; i <= jugadas.length; i++) {
      mesa.reproducir(i);
      const vista = mesa.vista();
      const replay = reproducirReplay({ version: 1, versionReglas: 1, versionReparto: 1,
        semilla: 830838, dador: 3, jugadas: jugadas.slice(0, i) });
      assert.ok(replay.ok);
      assert.deepEqual(vista.mesa, vistaPara(replay.estado, 0));
      assert.deepEqual(abrir().vista(), vista);
      const json = JSON.stringify(vista);
      assert.doesNotMatch(json, /semilla|reparto|restantes|"manos"|830838/);
      const ocultas = replay.estado.restantes.slice(1).flat();
      assert.ok(ocultas.every((id) => !json.includes(id)));
    }
    mesa.reproducir(null);
    assert.deepEqual(mesa.vista().mesa, final);
    assert.deepEqual(fuente.actual, evidencia);
  });
}

test("la flor y los repartos sucesivos rotan los cuatro dadores aunque el azar repita la semilla", () => {
  const { abrir } = pestaña(0);
  let mesa = abrir();
  let anterior: readonly CardId[] | undefined;
  for (const dador of [3, 0, 1, 2, 3]) {
    const inicial = mesa.vista().mesa;
    assert.equal(inicial.dador, dador);
    assert.equal(inicial.turno, (dador + 1) % 4);
    assert.equal(mesa.vista().paso?.tipo, "decidir-flor");
    if (anterior) assert.notDeepEqual([inicial.muestra, ...inicial.cartas.toSorted()], anterior);
    anterior = [inicial.muestra, ...inicial.cartas.toSorted()];
    resolver(mesa);
    while (mesa.vista().mesa.turno !== null) assert.ok(mesa.jugar(mesa.vista().mesa.cartas[0]));
    if (inicial.muestra === "copas-07" && dador === 3) {
      assert.equal(mesa.vista().mesa.vueltas.length, 2);
      assert.equal(mesa.vista().mesa.equipoGanador, 1);
    }
    mesa.repartirDeNuevo();
    const nuevo = mesa.vista();
    mesa = abrir();
    assert.deepEqual(mesa.vista(), nuevo);
  }
});

test("un registro interrumpido o desconocido vuelve a la primera pausa", () => {
  for (const dato of ["[", '{"version":2}', '{"version":1,"pausa":null,"replay":{}}']) {
    const almacen = { getItem: () => dato, setItem() {} };
    const mesa = crearMesaGuiada({ semilla: () => 217, obtenerAlmacen: () => almacen });
    assert.equal(mesa.vista().paso?.tipo, "decidir-flor");
    assert.equal(mesa.vista().mesa.turno, 0);
  }
});
