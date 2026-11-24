import assert from "node:assert/strict";
import test from "node:test";
import { crearLeccionProbabilidad } from "../../src/aprendizaje/probabilidad/leccion.ts";
import { type CardId } from "@eltruco/motor/cartas.ts";
import type { VistaAsiento } from "@eltruco/motor/mano.ts";

const prefijo = [
  [0, "bastos-03"], [1, "copas-11"], [2, "espadas-04"], [3, "oros-04"],
  [1, "oros-06"], [2, "copas-03"], [3, "copas-05"],
];

type Leccion = ReturnType<typeof crearLeccionProbabilidad>;

function jugar(leccion: Leccion, carta: CardId) {
  assert.ok(leccion.seleccionar(carta));
  assert.ok(leccion.confirmar());
}

function cartasVistas(mesa: VistaAsiento) {
  return mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? [])
    .map(({ asiento, carta }) => [asiento, carta]);
}

test("explorar o consultar conserva la misma posición y sólo la confirmación consume la selección", () => {
  const juego = crearLeccionProbabilidad();
  const inicio = juego.vista();
  assert.equal(inicio.escena, "salida");
  assert.equal(inicio.ejemplo, "salida");
  assert.equal(inicio.mesa.muestra, "copas-06");
  assert.deepEqual(inicio.mesa.cartas, ["copas-02", "oros-05", "bastos-03"]);
  assert.equal(juego.seleccionar("copas-06"), false);
  assert.equal(juego.confirmar(), false);
  assert.ok(juego.alternarChances());
  assert.equal(juego.vista().seleccionada, null);
  assert.ok(juego.alternarChances());
  assert.ok(juego.seleccionar("copas-02"));
  assert.equal(juego.vista().revelada, false);
  assert.ok(juego.alternarChances());
  assert.ok(juego.seleccionar("bastos-03"));
  assert.equal(juego.vista().prediccion, "copas-02");
  assert.equal(juego.vista().mesa, inicio.mesa);
  assert.ok(juego.confirmar());
  const siguiente = juego.vista();
  assert.equal(juego.confirmar(), false);
  assert.deepEqual(juego.vista(), siguiente);
  assert.deepEqual(cartasVistas(siguiente.mesa)[0], [0, "bastos-03"]);
  assert.deepEqual(siguiente.mesa.cartas, ["copas-02", "oros-05"]);
  assert.equal(siguiente.seleccionada, null);
  assert.equal(siguiente.revelada, false);
});

test("las siete jugadas del caso de estudio 44 dejan gastar o guardar la pieza", () => {
  const juego = crearLeccionProbabilidad();
  juego.abrir("segunda");
  const antes = juego.vista();
  assert.equal(antes.ejemplo, "segunda");
  assert.equal(antes.total, 7);
  assert.equal(antes.mesa.turno, 0);
  assert.deepEqual(antes.mesa.cartas, ["copas-02", "oros-05"]);
  assert.deepEqual(cartasVistas(antes.mesa), prefijo);
  assert.deepEqual(antes.mesa.vueltas[0].resultado, { tipo: "ganada", equipo: 1, asiento: 1 });

  jugar(juego, "oros-05");
  assert.equal(juego.vista().mesa.turno, null);
  assert.equal(juego.vista().mesa.equipoGanador, 1);
  assert.equal(juego.vista().total, 8);
  assert.equal(juego.alternarChances(), false);

  juego.abrir("segunda");
  assert.deepEqual(juego.vista(), antes);
  jugar(juego, "copas-02");
  assert.equal(juego.vista().mesa.vueltas.length, 2);
  assert.equal(juego.vista().mesa.turno, 0);
  assert.deepEqual(juego.vista().mesa.cartas, ["oros-05"]);
  assert.equal(juego.confirmar(), false);
  assert.ok(juego.alternarChances()); // En un turno forzado se pueden consultar las chances directamente.
  assert.equal(juego.confirmar(), false);
  jugar(juego, "oros-05");
  assert.equal(juego.vista().total, 12);
  assert.equal(juego.vista().mesa.equipoGanador, 0);
});

test("repasar proyecta sólo el prefijo y permite consultar sin jugar ni perder la decisión viva", () => {
  const juego = crearLeccionProbabilidad();
  juego.abrir("segunda");
  juego.seleccionar("copas-02");
  const presente = juego.vista();
  assert.equal(juego.reproducir(8), false);
  assert.equal(juego.reproducir(0.5), false);
  for (let cursor = 0; cursor <= 7; cursor++) {
    assert.ok(juego.reproducir(cursor));
    const vista = juego.vista();
    assert.equal(vista.cursor, cursor);
    assert.deepEqual(cartasVistas(vista.mesa), prefijo.slice(0, cursor));
    assert.equal(juego.seleccionar(vista.mesa.cartas[0]), vista.mesa.turno === 0);
    assert.equal(juego.alternarChances(), vista.mesa.turno === 0);
    assert.equal(juego.confirmar(), false);
  }
  juego.reproducir(null);
  assert.deepEqual(juego.vista(), presente);

  const alternativas = ["copas-02", "oros-05"] as const;
  const vistas = alternativas.map(carta => {
    juego.abrir("segunda");
    jugar(juego, carta);
    juego.reproducir(7);
    assert.ok(juego.alternarChances());
    return juego.vista().mesa;
  });
  assert.deepEqual(vistas[0], vistas[1]);
});

test("cambiar de escena desde el repaso reinicia la predicción y otro reparto cambia lo que ves", () => {
  const juego = crearLeccionProbabilidad({ azar: () => 830838 });
  juego.seleccionar("copas-02");
  juego.alternarChances();
  juego.reproducir(0);
  const anterior = juego.vista().mesa;
  juego.abrir("practica");
  const primera = juego.vista();
  assert.equal(primera.escena, "practica");
  assert.equal(primera.ejemplo, null);
  assert.equal(primera.cursor, null);
  assert.equal(primera.seleccionada, null);
  assert.equal(primera.revelada, false);
  assert.equal(primera.prediccion, null);
  assert.notEqual(primera.mesa.muestra, anterior.muestra);
  assert.notDeepEqual(primera.mesa.cartas.toSorted(), anterior.cartas.toSorted());
  while (juego.vista().mesa.turno !== null) jugar(juego, juego.vista().mesa.cartas[0]);
  assert.ok(juego.vista().mesa.equipoGanador !== null);
  juego.abrir("practica");
  assert.notEqual(juego.vista().mesa.muestra, primera.mesa.muestra);
  juego.abrir("salida");
  assert.deepEqual(juego.vista().mesa, anterior);
});
