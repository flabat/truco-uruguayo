import assert from "node:assert/strict";
import test from "node:test";
import { crearLeccionProbabilidad } from "../../src/aprendizaje/probabilidad/leccion.ts";
import { type CardId } from "../../src/motor/cartas.ts";
import type { VistaAsiento } from "../../src/motor/mano.ts";

const prefijo = [
  [0, "bastos-03"], [1, "copas-11"], [2, "espadas-04"], [3, "oros-04"],
  [1, "oros-06"], [2, "copas-03"], [3, "copas-05"],
];

type Leccion = ReturnType<typeof crearLeccionProbabilidad>;

function jugar(leccion: Leccion, carta: CardId) {
  assert.ok(leccion.predecir(carta));
  assert.ok(leccion.comparar());
  assert.ok(leccion.confirmar());
}

function cartasVistas(mesa: VistaAsiento) {
  return mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? [])
    .map(({ asiento, carta }) => [asiento, carta]);
}

test("predecir, revelar y cambiar la carta inspeccionada conserva la mesa hasta confirmar", () => {
  const pedidos: VistaAsiento[] = [];
  const juego = crearLeccionProbabilidad({ analizar: mesa => pedidos.push(mesa) });
  const inicio = juego.vista();
  assert.equal(inicio.escena, "salida");
  assert.equal(inicio.ejemplo, "salida");
  assert.equal(inicio.fase, "prediccion");
  assert.equal(inicio.mesa.muestra, "copas-06");
  assert.deepEqual(inicio.mesa.cartas.toSorted(), ["bastos-03", "copas-02", "oros-05"]);
  assert.equal(juego.comparar(), false);
  assert.equal(juego.inspeccionar("copas-02"), false);
  assert.equal(juego.confirmar(), false);
  assert.equal(juego.predecir("copas-06"), false);
  assert.deepEqual(pedidos, []);

  assert.ok(juego.predecir("oros-05"));
  assert.ok(juego.predecir("copas-02"));
  assert.ok(juego.comparar());
  assert.deepEqual(pedidos, [inicio.mesa]);
  assert.equal(juego.predecir("oros-05"), false);
  assert.ok(juego.inspeccionar("bastos-03"));
  assert.equal(juego.vista().prediccion, "copas-02");
  assert.equal(juego.vista().inspeccionada, "bastos-03");
  assert.deepEqual(juego.vista().mesa, inicio.mesa);
  assert.equal(juego.vista().fase, "comparacion");

  assert.ok(juego.confirmar());
  const siguiente = juego.vista();
  assert.equal(juego.confirmar(), false);
  assert.deepEqual(juego.vista(), siguiente);
  assert.deepEqual(cartasVistas(siguiente.mesa)[0], [0, "bastos-03"]);
  assert.equal(siguiente.mesa.cartas.length, 2);
  assert.equal(siguiente.prediccion, null);
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
  assert.equal(juego.vista().fase, "resultado");
  assert.equal(juego.vista().mesa.equipoGanador, 1);
  assert.equal(juego.vista().total, 8);
  assert.equal(juego.comparar(), false);

  juego.abrir("segunda");
  assert.deepEqual(juego.vista(), antes);
  jugar(juego, "copas-02");
  assert.equal(juego.vista().mesa.vueltas.length, 2);
  assert.equal(juego.vista().mesa.turno, 0);
  assert.deepEqual(juego.vista().mesa.cartas, ["oros-05"]);
  assert.equal(juego.confirmar(), false);
  assert.ok(juego.comparar()); // En un turno forzado se pueden consultar las chances directamente.
  assert.ok(juego.confirmar());
  assert.equal(juego.vista().total, 12);
  assert.equal(juego.vista().mesa.equipoGanador, 0);
});

test("repasar proyecta sólo el prefijo y permite consultar sin jugar ni perder la decisión viva", () => {
  const pedidos: VistaAsiento[] = [];
  const juego = crearLeccionProbabilidad({ analizar: mesa => pedidos.push(mesa) });
  juego.abrir("segunda");
  juego.predecir("copas-02");
  const presente = juego.vista();
  assert.equal(juego.reproducir(8), false);
  assert.equal(juego.reproducir(0.5), false);
  for (let cursor = 0; cursor <= 7; cursor++) {
    assert.ok(juego.reproducir(cursor));
    const vista = juego.vista();
    assert.equal(vista.fase, "repaso");
    assert.equal(vista.cursor, cursor);
    assert.deepEqual(cartasVistas(vista.mesa), prefijo.slice(0, cursor));
    assert.equal(juego.predecir(vista.mesa.cartas[0]), false);
    assert.equal(juego.comparar(), vista.mesa.turno === 0);
    assert.equal(juego.confirmar(), false);
  }
  assert.equal(pedidos.length, 2);
  assert.deepEqual(cartasVistas(pedidos[0]), []);
  assert.deepEqual(cartasVistas(pedidos[1]), prefijo);
  for (const mesa of pedidos) {
    assert.equal("reparto" in mesa || "restantes" in mesa || "semilla" in mesa || "escena" in mesa, false);
  }
  juego.reproducir(null);
  assert.deepEqual(juego.vista(), presente);

  const alternativas = ["copas-02", "oros-05"] as const;
  const vistas = alternativas.map(carta => {
    juego.abrir("segunda");
    jugar(juego, carta);
    juego.reproducir(7);
    assert.ok(juego.comparar());
    return pedidos.at(-1);
  });
  assert.deepEqual(vistas[0], vistas[1]);
});

test("cambiar de escena desde el repaso reinicia la predicción y otro reparto cambia lo que ves", () => {
  const juego = crearLeccionProbabilidad({ azar: () => 830838 });
  juego.predecir("copas-02");
  juego.comparar();
  juego.reproducir(0);
  const anterior = juego.vista().mesa;
  juego.abrir("practica");
  const primera = juego.vista();
  assert.equal(primera.escena, "practica");
  assert.equal(primera.ejemplo, null);
  assert.equal(primera.cursor, null);
  assert.equal(primera.fase, "prediccion");
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
