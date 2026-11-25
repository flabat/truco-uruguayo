import assert from "node:assert/strict";
import test from "node:test";
import { cajaDeCarta, calcularMesa } from "@eltruco/mesa-geometria";
import { datosDeHojas, entradaDeGeometria, historialDeMano, mesaDeJugador } from "../../app/src/mesa/modelo.ts";
import { mesaDe, partidaDe, vistaDe } from "./fixtures/app-mesa.ts";

const enReposo = { presentando: false };

test("1 contra 1: tanteador de Vos y Rival, dorsos del rival y la mano propia", () => {
  const vista = vistaDe(2, 0, {
    turno: 0,
    vueltaActual: { salida: 1, jugadas: [{ asiento: 1, carta: "copas-12" }] },
    acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" }],
  });
  const m = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vista, { puntos: [3, 1], meta: 20 }), enReposo);
  assert.equal(m.modalidad, "1v1");
  assert.equal(m.propio, 0);
  assert.equal(m.vistaDesde, 0);
  assert.deepEqual(m.tanteador, { texto: "Vos 3 · 1 Rival · a 20", nos: 3, ellos: 1, meta: 20 });
  const [yo, rival] = m.asientos;
  assert.equal(yo.papel, "Vos");
  assert.equal(yo.inicial, "A");
  assert.equal(rival.papel, "Rival");
  assert.equal(rival.nombre, "Diego");
  assert.equal(rival.enMano, 2);
  assert.equal(rival.jugada, "copas-12");
  assert.deepEqual(m.manoPropia, vista.cartas);
  assert.equal(m.vuelta, 1);
  assert.equal(m.lance, null);
  assert.equal(m.etiquetaLance, null);
  assert.equal(m.fin, null);
});

test("parejas: tanteador Nos y Ellos, la pareja y las etiquetas de Mano, Dador y Pie", () => {
  const vista = vistaDe(4, 2, { dador: 1, mano: 2, turno: 2 });
  const partida = partidaDe(vista, { puntos: [12, 9], meta: 30, pie: { pie: 0, vuelta: 1, grupos: [], opciones: [] } });
  const m = mesaDeJugador(mesaDe("2v2", 2), partida, enReposo);
  assert.equal(m.tanteador.texto, "Nos 12 · 9 Ellos · a 30");
  assert.deepEqual(m.asientos.map(a => a.papel), ["Tu pareja", "Rival", "Vos", "Rival"]);
  assert.deepEqual(m.asientos.map(a => a.etiquetas), [["Pie"], ["Dador"], ["Mano"], []]);
  assert.deepEqual(m.asientos.map(a => a.turno), [false, false, true, false]);
  assert.equal(m.asientos[0].enMano, 3);
});

test("en tu turno con carta legal se puede jugar, salvo mientras se presenta la jugada", () => {
  const vista = vistaDe(2, 0, { turno: 0, legales: ["carta", "truco"] });
  const partida = partidaDe(vista);
  const libre = mesaDeJugador(mesaDe("1v1", 0), partida, enReposo);
  assert.equal(libre.puedeJugarCarta, true);
  assert.equal(libre.estado.titulo, "Tu turno");
  assert.deepEqual(libre.legales, ["carta", "truco"]);
  assert.equal(mesaDeJugador(mesaDe("1v1", 0), partida, { presentando: true }).puedeJugarCarta, false);
  const ajeno = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vistaDe(2, 0, { turno: 1 })), enReposo);
  assert.equal(ajeno.puedeJugarCarta, false);
  assert.equal(ajeno.estado.titulo, "Turno de Diego");
});

test("el canto pendiente usa el verbo y nombra a la pareja cuando responde ella", () => {
  const tuyo = vistaDe(2, 0, { pendiente: { tipo: "envido", asiento: 1 }, legales: ["quiero", "no-quiero", "real-envido"] });
  const m = mesaDeJugador(mesaDe("1v1", 0), partidaDe(tuyo), enReposo);
  assert.equal(m.estado.titulo, "Diego tocó envido");
  assert.equal(m.puedeJugarCarta, false);

  const dePareja = vistaDe(4, 2, { pendiente: { tipo: "envido", asiento: 1 } });
  assert.equal(mesaDeJugador(mesaDe("2v2", 2), partidaDe(dePareja), enReposo).estado.titulo, "Responde Clara");
  const propio = vistaDe(4, 2, { pendiente: { tipo: "truco", asiento: 0 } });
  assert.equal(mesaDeJugador(mesaDe("2v2", 2), partidaDe(propio), enReposo).estado.titulo, "Responde el equipo rival");
});

test("el compañero computadora que espera la indicación del pie cambia el estado", () => {
  const vista = vistaDe(4, 2, { turno: 0 });
  const partida = partidaDe(vista, { pie: { pie: 2, vuelta: 1, esperando: 0, grupos: [], opciones: [] } });
  assert.deepEqual(mesaDeJugador(mesaDe("2v2", 2), partida, enReposo).estado, {
    titulo: "Clara espera tu indicación",
    indicacion: "Hablale en voz alta o dejá que elija su carta en silencio.",
  });
});

test("la vuelta cerrada sigue a la vista con su ganadora o parda", () => {
  const jugadas = [{ asiento: 0, carta: "espadas-01" }, { asiento: 1, carta: "copas-12" }] as const;
  const ganada = vistaDe(2, 0, {
    cartas: ["oros-07", "copas-04"],
    acciones: jugadas.map(j => ({ tipo: "carta" as const, ...j })),
    vueltas: [{ salida: 0, jugadas, resultado: { tipo: "ganada", equipo: 0, asiento: 0 } }],
  });
  const m = mesaDeJugador(mesaDe("1v1", 0), partidaDe(ganada), enReposo);
  assert.deepEqual(m.asientos.map(a => [a.jugada, a.ganadora, a.parda]), [["espadas-01", true, false], ["copas-12", false, false]]);
  assert.equal(m.vuelta, 1);
  assert.equal(m.asientos[1].enMano, 2);

  const parda = vistaDe(2, 0, { vueltas: [{ salida: 0, jugadas, resultado: { tipo: "parda" } }] });
  const p = mesaDeJugador(mesaDe("1v1", 0), partidaDe(parda), enReposo);
  assert.deepEqual(p.asientos.map(a => [a.ganadora, a.parda]), [[false, true], [false, true]]);
});

test("al cerrar la mano, el fin resume los tantos, las pruebas y el botón", () => {
  const vista = vistaDe(2, 0, {
    vueltaActual: null,
    resultado: { equipo: 0, tantos: 2, motivo: "vueltas" },
    resumenTantos: {
      totales: [4, 0],
      cobros: [
        { equipo: 0, tantos: 2, motivo: "envido", asiento: 0, tantoGanador: 31 },
        { equipo: 0, tantos: 2, motivo: "truco" },
      ],
    },
    pruebasDeTantos: [{ asiento: 0, motivo: "envido", total: 31, cartas: ["espadas-01", "oros-07"] }],
  });
  const m = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vista), enReposo);
  assert.deepEqual(m.fin, {
    titulo: "Ganaste la mano",
    motivo: "El cierre fue por las vueltas.",
    cobros: [
      { equipo: "Vos", texto: "+4 tantos · 2 tantos por envido (Ana con 31), 2 tantos por truco querido" },
      { equipo: "Rival", texto: "0 tantos" },
    ],
    pruebas: [{ nombre: "Ana", titulo: "Envido ganador · 31 tantos", cartas: ["espadas-01", "oros-07"] }],
    tituloCobros: "Tantos de esta mano",
    boton: "Repartir otra mano",
  });
  assert.deepEqual(m.manoPropia, ["copas-04"], "las cartas de la prueba propia salen de la mano");
  assert.equal(m.estado.titulo, "Ganaste la mano");

  const fin = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vista, { contexto: { versionVista: 1, fase: "chico-terminado" } }), enReposo);
  assert.equal(fin.fin?.boton, "Crear otra mesa");
  assert.equal(fin.fin?.titulo, "Ganaste la partida");
  assert.equal(mesaDeJugador(mesaDe("1v1", 0), partidaDe(vista), { presentando: true }).fin, null,
    "mientras se presenta la última carta no hay tarjeta de fin");
});

test("con resultado, el asiento que muestra su prueba de tantos no deja dorsos", () => {
  const vista = vistaDe(2, 0, {
    vueltaActual: null,
    acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" }],
    resultado: { equipo: 1, tantos: 2, motivo: "envido" },
    resumenTantos: { totales: [0, 1], cobros: [{ equipo: 1, tantos: 1, motivo: "truco" }] },
    pruebasDeTantos: [{ asiento: 1, motivo: "envido", total: 30, cartas: ["oros-10", "oros-12"] }],
  });
  const m = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vista), enReposo);
  assert.equal(m.asientos[1].enMano, 0);
  assert.equal(m.asientos[0].enMano, 3);
  assert.deepEqual(m.fin?.cobros[1], { equipo: "Rival", texto: "+1 tanto · 1 tanto por truco sin cantar" });
  const enJuego = mesaDeJugador(mesaDe("1v1", 0), partidaDe(vistaDe(2, 0, { acciones: vista.acciones, pruebasDeTantos: vista.pruebasDeTantos })), enReposo);
  assert.equal(enJuego.asientos[1].enMano, 2, "sin resultado la prueba no oculta dorsos");
});

test("las voces vienen del reposo o del paso que se presenta", () => {
  const vista = vistaDe(2, 0, { acciones: [{ tipo: "truco", asiento: 1 }], pendiente: { tipo: "truco", asiento: 1 } });
  const partida = partidaDe(vista);
  assert.deepEqual(mesaDeJugador(mesaDe("1v1", 0), partida, enReposo).voces, [{ asiento: 1, texto: "Truco", indice: 0 }]);
  const voz = { asiento: 0, texto: "Quiero", indice: 0 };
  const presentada = mesaDeJugador(mesaDe("1v1", 0), partida, { voz, presentando: true });
  assert.deepEqual(presentada.voces, [voz]);
  assert.deepEqual(presentada.estado, { titulo: "Ana", indicacion: "Quiero" });
});

test("a 360 × 640 con la hoja más alta, la mano queda por encima de la hoja", () => {
  const vista = vistaDe(4, 2, { turno: 2, legales: ["carta", "envido", "truco"] });
  const m = mesaDeJugador(mesaDe("2v2", 2), partidaDe(vista), enReposo);
  const entrada = entradaDeGeometria(m, { ancho: 360, alto: 640 }, { alto: 420 });
  assert.deepEqual(entrada.cartas, [3, 3, 3, 3]);
  assert.equal(entrada.lance, undefined);
  const g = calcularMesa(entrada);
  const { hoja } = g;
  assert.ok(hoja);
  assert.equal(g.mano.length, 3);
  for (const carta of g.mano) {
    const caja = cajaDeCarta(carta);
    assert.ok(caja.y + caja.alto <= hoja.y + 0.5, `la carta termina en ${caja.y + caja.alto}, la hoja empieza en ${hoja.y}`);
  }
});

const nombreParejas = (a: number) => ["Clara", "Diego", "Ana", "Beto"][a];

test("historialDeMano: jugadas y frases del pie en orden, con las frases antes de la jugada que siguen", () => {
  const vista = vistaDe(4, 2, {
    acciones: [
      { tipo: "envido", asiento: 0 },
      { tipo: "quiero", asiento: 1 },
      { tipo: "carta", asiento: 0, carta: "copas-04" },
      { tipo: "mazo", asiento: 1 },
    ],
  });
  const indicaciones = [
    { emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 2 },
    { emisor: 2, destinatario: 0, frase: "juga", vuelta: 1, indiceAccion: 4 },
  ] as const;
  assert.deepEqual(historialDeMano(vista, indicaciones, nombreParejas), [
    "Clara dijo «Envido».",
    "Diego dijo «Quiero».",
    "Ana le dijo a Clara «Vení».",
    "Clara jugó 4 de copas.",
    "Diego se fue al mazo.",
    "Ana le dijo a Clara «Jugá».",
  ]);
  assert.deepEqual(historialDeMano(vistaDe(4, 2), undefined, nombreParejas), []);
});

test("historialDeMano: la flor querida va después de la acción que la resolvió", () => {
  const vista = vistaDe(4, 2, {
    acciones: [
      { tipo: "flor", asiento: 0 },
      { tipo: "flor", asiento: 1 },
      { tipo: "carta", asiento: 0, carta: "copas-04" },
    ],
    cobros: [{
      equipo: 0, tantos: 6, motivo: "flor", asiento: 0, tantoGanador: 33,
      comparacionFlor: { indiceAccion: 1, participantes: [{ asiento: 0, total: 33 }, { asiento: 1, total: 30 }, { asiento: 2, total: 25 }] },
    }],
  });
  assert.deepEqual(historialDeMano(vista, [], nombreParejas), [
    "Clara dijo «Flor».",
    "Diego dijo «Flor».",
    "Flor querida. Clara cantó 33, Diego cantó 30 y Ana cantó 25. Ganó Clara con 33 de flor. El equipo 1 sumó 6 tantos al tanteador.",
    "Clara jugó 4 de copas.",
  ]);
});

test("datosDeHojas: vueltas terminadas, la cuenta de la mano y los tantos cobrados como el panel web", () => {
  const vista = vistaDe(2, 0, {
    turno: 0,
    valorTruco: 2,
    vueltaActual: { salida: 0, jugadas: [{ asiento: 0, carta: "oros-07" }] },
    vueltas: [{ salida: 0, jugadas: [{ asiento: 0, carta: "espadas-01" }, { asiento: 1, carta: "copas-12" }], resultado: { tipo: "ganada", asiento: 0, equipo: 0 } }],
    cobros: [{ equipo: 1, tantos: 2, motivo: "envido", asiento: 1, tantoGanador: 31 }],
  });
  const mesa = mesaDe("1v1", 0);
  const partida = partidaDe(vista, { manoNumero: 4 });
  const datos = datosDeHojas(mesa, partida, mesaDeJugador(mesa, partida, enReposo), enReposo);
  assert.equal(datos.encabezado, "Mano 4 · Vuelta 2");
  assert.deepEqual(datos.vueltas, [{ numero: "1.ª vuelta", ganador: "Vos", jugadas: "Ana · As de espadas, Diego · Rey de copas" }]);
  assert.deepEqual(datos.cuenta, { tusTantos: "27 de envido", valor: "2 tantos" });
  assert.equal(datos.cobrados.titulo, "Tantos cobrados");
  assert.equal(datos.cobrados.filas[0].equipo, "Rival · 2 tantos");
  assert.match(datos.cobrados.filas[0].texto, /^por .+ \(Diego con 31\)$/);
});
