import assert from "node:assert/strict";
import test from "node:test";
import { crearLeccionTruco } from "../../src/aprendizaje/leccion-truco.ts";
import { repartir } from "../../src/motor/reparto.ts";
import { evaluarTantos } from "../../src/motor/tantos.ts";

function pestaña() {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v) };
}

test("el ejemplo de dos papeles conserva la palabra y los tantos independientes del envido", () => {
  const almacen = pestaña();
  const opciones = { obtenerAlmacen: () => almacen };
  const juego = crearLeccionTruco(opciones);
  const inicio = juego.vista();
  assert.deepEqual(inicio.envido, { equipo: 0, total: 33 });
  assert.deepEqual(inicio.mesa.cartas, ["bastos-12", "espadas-06", "copas-11"]);
  assert.equal("reparto" in inicio.mesa || "semilla" in inicio.mesa || "restantes" in inicio.mesa, false);
  assert.ok(juego.actuar({ tipo: "truco", asiento: 0 }));
  assert.deepEqual(juego.vista().mesa, inicio.mesa);
  assert.deepEqual(juego.vista().acciones, [{ tipo: "truco", asiento: 0 }, { tipo: "quiero", asiento: 1 }]);
  assert.ok(juego.actuar({ tipo: "carta", asiento: 0, carta: "bastos-12" }));
  assert.ok(juego.actuar({ tipo: "carta", asiento: 0, carta: "espadas-06" }));
  assert.deepEqual(juego.vista().resultado, { equipo: 1, tantos: 2, motivo: "vueltas" });

  juego.repetir("otro-papel");
  const replica = crearLeccionTruco(opciones);
  assert.deepEqual(replica.vista(), juego.vista());
  assert.equal(replica.vista().apuesta, "pendiente");
  assert.deepEqual(replica.vista().envido, { equipo: 1, total: 33 });
  assert.equal(replica.actuar({ tipo: "carta", asiento: 0, carta: "bastos-11" }), false);
  assert.ok(replica.actuar({ tipo: "no-quiero", asiento: 0 }));
  assert.deepEqual(replica.vista().resultado, { equipo: 1, tantos: 1, motivo: "rechazo" });
  assert.equal(replica.vista().mesa.turno, null);
  replica.reproducir(1);
  assert.equal(replica.vista().apuesta, "pendiente");
  assert.equal(replica.actuar({ tipo: "quiero", asiento: 0 }), false);
  assert.deepEqual(crearLeccionTruco(opciones).vista(), replica.vista());
});

test("otro reparto cambia el problema visible sin flor y se puede recuperar el ejemplo en ambos papeles", () => {
  const almacen = pestaña();
  const juego = crearLeccionTruco({ obtenerAlmacen: () => almacen, azar: () => 0 });
  for (let papel = 0; papel < 2; papel++) {
    juego.repetir("ejemplo");
    const fijas = juego.vista().mesa.cartas;
    for (let i = 0; i < 3; i++) {
      const antes = juego.vista().mesa;
      juego.repetir("otro-reparto");
      const despues = juego.vista().mesa;
      assert.notEqual(despues.muestra, antes.muestra);
      assert.notDeepEqual(despues.cartas.toSorted(), antes.cartas.toSorted());
      const { replay } = JSON.parse(almacen.getItem("truco-oriental.leccion-truco.v2")!);
      const reparto = repartir(replay.semilla, replay.dador);
      assert.ok(reparto.manos.every((m) => evaluarTantos(m, reparto.muestra).modalidad === "envido"));
      assert.equal(despues.dador, antes.dador);
    }
    juego.repetir("ejemplo");
    assert.deepEqual(juego.vista().mesa.cartas, fijas);
    juego.repetir("otro-papel");
  }
});

test("se descarta tanto la muestra repetida como la misma terna con otra muestra", () => {
  const ejemplo = repartir(217, 3);
  assert.equal(repartir(42, 3).muestra, ejemplo.muestra);
  assert.deepEqual(repartir(15135, 3).manos[0], ejemplo.manos[0]);
  for (const inicio of [42, 15135]) {
    const juego = crearLeccionTruco({ azar: () => inicio, obtenerAlmacen: () => undefined });
    juego.repetir("otro-reparto");
    const { mesa } = juego.vista();
    assert.notEqual(mesa.muestra, ejemplo.muestra);
    assert.notDeepEqual(mesa.cartas.toSorted(), ejemplo.manos[0].toSorted());
  }
});
