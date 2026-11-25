import assert from "node:assert/strict";
import test from "node:test";
import { cajaDeCarta, calcularMesa } from "@eltruco/mesa-geometria";
import type { ResumenLance } from "@eltruco/motor/mesa-online.ts";
import { hojaDeCantos } from "../../app/src/mesa/hoja-cantos.ts";
import {
  cartasDeLaEspera, datosDeHojas, datosDeTercetos, entradaDeGeometria, entradaDeHoja, historialDeMano, mesaDeJugador,
  datosDelEspectador, mesaDeEspectador, mesaDeTercetos, pasosDelEspectador, recordarCartas, seguimientoInicial, seguirConsulta,
  versionarObservada, type MesaObservada,
} from "../../app/src/mesa/modelo.ts";
import { entreCartas, vueltaCompleta } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { pausaDeVoz } from "@eltruco/cliente/voces.ts";
import { mesaDe, mesaTercetosDe, partidaDe, partidaTercetosDe, vistaDe } from "./fixtures/app-mesa.ts";

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

// Con la mano en 0, el duelo 1 es 0 contra 3, el 2 es 1 contra 4 y el 3 es 2 contra 5.
const primerDuelo: ResumenLance = {
  tipo: "pico-a-pico", duelo: 1, activos: [0, 3],
  resultado: { equipo: 0, tantos: 1, motivo: "vueltas" },
  acciones: [{ tipo: "carta", asiento: 0, carta: "espadas-01" }, { tipo: "carta", asiento: 3, carta: "copas-12" }],
  cobros: [{ equipo: 0, tantos: 1, motivo: "truco" }],
  vueltas: [{ salida: 0, jugadas: [{ asiento: 0, carta: "espadas-01" }, { asiento: 3, carta: "copas-12" }], resultado: { tipo: "ganada", equipo: 0, asiento: 0 } }],
  puntos: [19, 22],
};

function picoDelDuelo2() {
  const vista = vistaDe(6, 2, {
    mano: 0, dador: 5, turno: 1,
    vueltaActual: { salida: 1, jugadas: [] },
  });
  return partidaTercetosDe(vista, {
    estado: "esperando", manoNumero: 3, puntos: [19, 22], meta: 40,
    lance: { tipo: "pico-a-pico", duelo: 2, activos: [1, 4] },
    historialLances: [primerDuelo],
  });
}

test("tercetos en redondilla: cinco círculos, la etiqueta del lance y el tanteador Nos y Ellos", () => {
  const vista = vistaDe(6, 0, { mano: 1, dador: 0, turno: 1 });
  const m = mesaDeTercetos(mesaTercetosDe(0, 40), partidaTercetosDe(vista, { manoNumero: 2, puntos: [18, 22], meta: 40 }), enReposo);
  assert.equal(m.modalidad, "3v3");
  assert.deepEqual(m.lance, { tipo: "redondilla" });
  assert.equal(m.etiquetaLance, "Reparto 2 · Redondilla · Vuelta 1");
  assert.equal(m.tanteador.texto, "Nos 18 · 22 Ellos · a 40");
  assert.deepEqual(m.asientos.map(a => a.papel), ["Vos", "Rival", "Compañero", "Rival", "Compañero", "Rival"]);
  assert.deepEqual(m.asientos.map(a => a.estadoPico), [null, null, null, null, null, null]);
  assert.deepEqual(m.estado, { titulo: "Turno de Diego", indicacion: "Esperando la jugada." });
  const g = calcularMesa(entradaDeGeometria(m, { ancho: 375, alto: 760 }, null));
  assert.deepEqual(g.asientos.filter(a => a.asiento !== 0).map(a => a.forma), ["circulo", "circulo", "circulo", "circulo", "circulo"]);
  assert.ok(g.lance, "hay lugar para la etiqueta del lance");
});

test("tercetos en pico a pico: esperando el duelo 3 la mano no se juega y los demás muestran su estado", () => {
  const m = mesaDeTercetos(mesaTercetosDe(2, 40), picoDelDuelo2(), enReposo);
  assert.deepEqual(m.lance, { tipo: "pico", activos: [1, 4], duelo: 2 });
  assert.equal(m.etiquetaLance, "Pico a pico · Duelo 2 de 3");
  assert.equal(m.puedeJugarCarta, false);
  assert.deepEqual(m.manoPropia, []);
  assert.deepEqual(m.estado, { titulo: "Turno de Diego", indicacion: "Te toca en el duelo 3 de 3." });
  assert.deepEqual(m.asientos.map(a => a.estadoPico), ["Ya jugó", "En duelo", "Duelo 3", "Ya jugó", "En duelo", "Duelo 3"]);
  const g = calcularMesa(entradaDeGeometria(m, { ancho: 375, alto: 760 }, null));
  assert.deepEqual(g.asientos.map(a => a.forma), ["punto", "completo", "punto", "punto", "completo", "punto"]);
});

test("tercetos: con la tercera ya jugada, la indicación dice que se espera el próximo reparto", () => {
  const partida = picoDelDuelo2();
  const m = mesaDeTercetos(mesaTercetosDe(0, 40), partida, enReposo);
  assert.equal(m.estado.indicacion, "Ya jugaste tu duelo. Esperá el próximo reparto.");
});

test("tercetos: el canto del rival que no te toca lo responde tu equipo", () => {
  const vista = vistaDe(6, 0, { pendiente: { tipo: "truco", asiento: 1 }, acciones: [{ tipo: "truco", asiento: 1 }] });
  const m = mesaDeTercetos(mesaTercetosDe(0), partidaTercetosDe(vista), enReposo);
  assert.deepEqual(m.estado, { titulo: "Responde tu equipo", indicacion: "Diego gritó truco." });
});

test("tercetos: la falta envido de la hoja dice cuánto cobra cada equipo con faltaPorEquipo", () => {
  const vista = vistaDe(6, 1, { turno: 1, legales: ["carta", "falta-envido"] });
  const mesa = mesaTercetosDe(1);
  const hoja = hojaDeCantos(entradaDeHoja(mesa, partidaTercetosDe(vista, { faltaPorEquipo: [12, 18] })));
  assert.ok(hoja?.notas.includes("Falta envido · Si gana tu equipo, cobra 18 tantos. Si ganan los rivales, cobran 12 tantos."));
  const parejas = hojaDeCantos(entradaDeHoja(mesaDe("2v2", 1), partidaDe(vistaDe(4, 1, { turno: 1, legales: ["carta", "falta-envido"] }))));
  assert.ok(!parejas?.notas.some(n => n.startsWith("Falta envido")), "en parejas no hay nota de falta");
});

test("tercetos: al cerrar el reparto, la tarjeta dice «Tantos de este reparto» con los totales del reparto", () => {
  const vista = vistaDe(6, 0, {
    vueltaActual: null,
    resultado: { equipo: 1, tantos: 2, motivo: "vueltas" },
    resumenTantos: { totales: [0, 2], cobros: [{ equipo: 1, tantos: 2, motivo: "truco" }] },
    resumenReparto: { totales: [1, 2], cobros: [{ equipo: 0, tantos: 1, motivo: "truco" }, { equipo: 1, tantos: 2, motivo: "truco" }] },
  });
  const partida = partidaTercetosDe(vista, {
    estado: "terminado", contexto: { versionVista: 1, fase: "reparto-cerrado" },
    lance: { tipo: "pico-a-pico", duelo: 3, activos: [2, 5] }, historialLances: [primerDuelo],
  });
  const m = mesaDeTercetos(mesaTercetosDe(0), partida, enReposo);
  assert.equal(m.fin?.tituloCobros, "Tantos de este reparto");
  assert.equal(m.fin?.titulo, "Reparto terminado");
  assert.equal(m.fin?.motivo, "El cierre fue por las vueltas.");
  assert.deepEqual(m.fin?.cobros, [{ equipo: "Nos", texto: "+1 tanto" }, { equipo: "Ellos", texto: "+2 tantos" }]);
  assert.equal(m.fin?.boton, "Repartir otra mano");
  assert.deepEqual(m.asientos.map(a => a.estadoPico), ["Ya jugó", "Sin jugar", "Sin jugar", "Ya jugó", "Sin jugar", "Sin jugar"]);
});

test("datosDeTercetos: el encabezado nombra el lance y la hoja Reparto agrupa los duelos cerrados", () => {
  const mesa = mesaTercetosDe(2, 40);
  const partida = picoDelDuelo2();
  const datos = datosDeTercetos(mesa, partida, mesaDeTercetos(mesa, partida, enReposo), enReposo);
  assert.equal(datos.encabezado, "Reparto 3 · Pico a pico · Duelo 2 de 3 · Vuelta 1");
  assert.equal(datos.cuenta, null, "sin mano propia no hay tantos propios");
  assert.deepEqual(datos.reparto, [{
    titulo: "Duelo 1 de 3",
    resultado: "Ganó tu equipo por las vueltas · Nos 19 · 22 Ellos",
    tantos: "Nos +1 tanto · Ellos 0 tantos",
    historial: ["Clara jugó as de espadas.", "Beto jugó rey de copas."],
    vueltas: [{ numero: "1.ª vuelta", ganador: "Nos", jugadas: "Clara · As de espadas, Beto · Rey de copas" }],
    cobros: [{ equipo: "Nos · 1 tanto", texto: "por truco sin cantar" }],
  }]);
});

test("tercetos: quien espera ve las cartas recordadas del reparto, menos las que ya jugó, y no las juega", () => {
  const duelo1 = partidaTercetosDe(vistaDe(6, 0, { turno: 0, legales: ["carta"] }), {
    manoNumero: 3, lance: { tipo: "pico-a-pico", duelo: 1, activos: [0, 3] },
  });
  const recordadas = recordarCartas(null, duelo1);
  assert.deepEqual(recordadas, { manoNumero: 3, cartas: ["espadas-01", "oros-07", "copas-04"] });
  assert.equal(recordarCartas(recordadas, duelo1), recordadas, "las mismas cartas no cambian la memoria");
  const espera = picoDelDuelo2();
  assert.equal(recordarCartas(recordadas, espera), recordadas, "esperando no se olvidan");

  const cartas = cartasDeLaEspera(recordadas, espera, 0);
  assert.deepEqual(cartas, ["oros-07", "copas-04"]);
  assert.deepEqual(cartasDeLaEspera(recordadas, { ...espera, manoNumero: 4 }, 0), [], "de otro reparto no sirven");
  assert.deepEqual(cartasDeLaEspera(null, espera, 0), [], "al recargar mientras espera, la mano queda vacía");
  assert.deepEqual(cartasDeLaEspera(recordadas, duelo1, 0), [], "jugando manda la vista");

  const m = mesaDeTercetos(mesaTercetosDe(0, 40), espera, { presentando: false, cartasEnEspera: cartas });
  assert.deepEqual(m.manoPropia, ["oros-07", "copas-04"]);
  assert.equal(m.puedeJugarCarta, false);
  assert.equal(entradaDeGeometria(m, { ancho: 375, alto: 760 }, null).cartas[0], 2);
});

test("tercetos: la hoja de quien espera no trae tantos propios y sí la falta", () => {
  const entrada = entradaDeHoja(mesaTercetosDe(2, 40), picoDelDuelo2());
  assert.equal("tantosPropios" in entrada, false);
  assert.deepEqual(entrada.falta, { propio: 30, rival: 30 });
  assert.equal(hojaDeCantos(entrada), null);
});

test("tercetos: un canto pendiente en el pico a pico lo responde el compañero que juega el duelo", () => {
  const partida = picoDelDuelo2();
  const conCanto = { ...partida, vista: { ...partida.vista, pendiente: { tipo: "envido" as const, asiento: 1 as const } } };
  const m = mesaDeTercetos(mesaTercetosDe(2, 40), conCanto, enReposo);
  assert.deepEqual(m.estado, { titulo: "Responde Eli", indicacion: "Diego tocó envido." });
});

test("datosDeTercetos: con el lance en la mesa ya archivado, sus vueltas no se repiten arriba", () => {
  const vueltas = primerDuelo.vueltas;
  const vista = vistaDe(6, 0, { vueltaActual: null, vueltas, resultado: { equipo: 0, tantos: 1, motivo: "vueltas" } });
  const partida = partidaTercetosDe(vista, {
    estado: "terminado", contexto: { versionVista: 1, fase: "reparto-cerrado" },
    lance: { tipo: "pico-a-pico", duelo: 1, activos: [0, 3] }, historialLances: [primerDuelo],
  });
  const mesa = mesaTercetosDe(0);
  const datos = datosDeTercetos(mesa, partida, mesaDeTercetos(mesa, partida, enReposo), enReposo);
  assert.deepEqual(datos.vueltas, []);
  assert.equal(datos.reparto?.[0].vueltas.length, 1);
  assert.deepEqual(datos.reparto?.[0].historial, [], "su historial ya está arriba");
});

function observadaDe(tablero: Partial<MesaObservada["tablero"]> = {}, mesa: Partial<MesaObservada> = {}): MesaObservada {
  return {
    id: "m1", modo: "2v2", formato: "pairs", origen: "humana", humanos: 2, computadoras: 2, manoNumero: 3,
    puntos: [12, 9], meta: 30, ultimaActividad: "2026-11-25T12:00:00.000Z", estado: "en-juego",
    asientos: [
      { asiento: 0, equipo: 0, tipo: "humano", nombre: "Ana" },
      { asiento: 1, equipo: 1, tipo: "humano", nombre: "Diego" },
      { asiento: 2, equipo: 0, tipo: "humano", nombre: "Clara" },
      { asiento: 3, equipo: 1, tipo: "computadora", nombre: "Compu" },
    ],
    tablero: {
      dador: 0, mano: 1, muestra: "oros-06", vueltas: [], vueltaActual: { salida: 1, jugadas: [] },
      turnoDeCartas: 1, valorTruco: 1, acciones: [], cobros: [], comparacionFlor: undefined, resultado: null,
      ...tablero,
    },
    ...mesa,
  };
}

const vueltaDeDos = {
  salida: 1,
  jugadas: [{ asiento: 1, carta: "oros-07" }, { asiento: 2, carta: "copas-04" }],
} satisfies MesaObservada["tablero"]["vueltaActual"];
const accionesDeDos = vueltaDeDos.jugadas.map(j => ({ tipo: "carta" as const, ...j }));

test("espectador: tanteador con los nombres de cada pareja, sin asiento propio ni mano", () => {
  const m = mesaDeEspectador(observadaDe({ vueltaActual: vueltaDeDos, acciones: accionesDeDos, turnoDeCartas: 3 }));
  assert.deepEqual(m.tanteador, { texto: "Ana y Clara 12 · 9 Diego y Compu · a 30", nos: 12, ellos: 9, meta: 30 });
  assert.equal(m.propio, null);
  assert.equal(m.vistaDesde, 0);
  assert.deepEqual(m.manoPropia, []);
  assert.deepEqual(m.legales, []);
  assert.equal(m.puedeJugarCarta, false);
  assert.equal(m.fin, null);
  assert.deepEqual(m.asientos.map(a => a.papel), ["Equipo 1", "Equipo 2", "Equipo 1", "Equipo 2"]);
  assert.deepEqual(m.asientos.map(a => a.enMano), [3, 2, 2, 3]);
  assert.deepEqual(m.asientos.map(a => a.jugada), [null, "oros-07", "copas-04", null]);
  assert.deepEqual(m.asientos[0].etiquetas, ["Dador"]);
  assert.deepEqual(m.asientos[1].etiquetas, ["Mano"]);
  assert.equal(m.asientos[3].turno, true);
  assert.deepEqual(m.estado, { titulo: "La mano en juego", indicacion: "Clara jugó 4 de copas." });
});

test("espectador: la frase del pie es pública y se ve como voz del pie; nunca hay gestos", () => {
  const m = mesaDeEspectador(observadaDe({
    vueltaActual: vueltaDeDos, acciones: accionesDeDos,
    indicaciones: [{ emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 2 }],
  }));
  assert.deepEqual(m.voces, [{ asiento: 2, texto: "Ana, vení", indice: 0 }]);
  assert.equal(m.estado.indicacion, "Clara le dijo a Ana «Vení».");
  assert.doesNotMatch(JSON.stringify(m), /gesto/i);
  // Con otra carta en el paño, la frase ya no está en el aire.
  const despues = mesaDeEspectador(observadaDe({
    vueltaActual: { ...vueltaDeDos, jugadas: [...vueltaDeDos.jugadas, { asiento: 3, carta: "espadas-01" }] },
    acciones: [...accionesDeDos, { tipo: "carta", asiento: 3, carta: "espadas-01" }],
    indicaciones: [{ emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 2 }],
  }));
  assert.deepEqual(despues.voces, []);
});

test("espectador: el resumen dice quién ganó la mano o la partida", () => {
  const ganada = observadaDe({ resultado: { equipo: 1, tantos: 2, motivo: "vueltas" }, turnoDeCartas: null });
  assert.equal(mesaDeEspectador(ganada).estado.indicacion, "El equipo 2 ganó la mano.");
  const terminada = observadaDe({}, { estado: "terminada", puntos: [30, 21] });
  assert.deepEqual(mesaDeEspectador(terminada).estado, { titulo: "Partida terminada", indicacion: "Ganó el equipo 1." });
});

test("espectador: se presentan las jugadas nuevas de la misma mano, el truco con su voz", () => {
  const antes = versionarObservada(observadaDe({
    vueltaActual: { salida: 1, jugadas: [vueltaDeDos.jugadas[0]] }, acciones: [accionesDeDos[0]],
  }));
  const ultima = { asiento: 3, carta: "espadas-01" } as const;
  const ahora = versionarObservada(observadaDe({
    vueltaActual: { salida: 1, jugadas: [...vueltaDeDos.jugadas, ultima] },
    acciones: [...accionesDeDos, { tipo: "truco", asiento: 3 }, { tipo: "carta", ...ultima }],
  }));
  const pasos = pasosDelEspectador(antes, ahora, false);
  assert.equal(pasos.length, 3);
  const [primero, truco, segundo] = pasos;
  assert.deepEqual(truco.voz, { asiento: 3, texto: "Truco", indice: 0 });
  assert.equal(truco.partida!.mesa.tablero.valorTruco, 2);
  assert.equal(primero.espera, entreCartas);
  assert.deepEqual(primero.partida!.mesa.tablero.vueltaActual?.jugadas, vueltaDeDos.jugadas);
  assert.equal(primero.partida!.mesa.tablero.acciones.length, 2);
  assert.equal(mesaDeEspectador(primero.partida!.mesa).estado.indicacion, "Clara jugó 4 de copas.");
  assert.equal(segundo.partida, ahora);
  assert.deepEqual(pasosDelEspectador(ahora, ahora, false), []);
  assert.deepEqual(pasosDelEspectador(undefined, ahora, true), []);
  const otraMano = versionarObservada(observadaDe({}, { manoNumero: 4 }));
  assert.deepEqual(pasosDelEspectador(ahora, otraMano, false), []);
});

test("espectador: al completar una vuelta, el naipe se ve antes del veredicto", () => {
  const antes = versionarObservada(observadaDe({
    vueltaActual: { salida: 1, jugadas: vueltaDeDos.jugadas }, acciones: accionesDeDos,
  }));
  const cerrada = {
    salida: 1, resultado: { tipo: "ganada", asiento: 3, equipo: 1 },
    jugadas: [...vueltaDeDos.jugadas, { asiento: 3, carta: "espadas-01" }, { asiento: 0, carta: "bastos-04" }],
  } satisfies MesaObservada["tablero"]["vueltas"][number];
  const ahora = versionarObservada(observadaDe({
    vueltas: [cerrada], vueltaActual: { salida: 3, jugadas: [{ asiento: 3, carta: "oros-03" }] },
    acciones: cerrada.jugadas.concat({ asiento: 3, carta: "oros-03" }).map(j => ({ tipo: "carta" as const, ...j })),
  }));
  const [tercera, cuarta, quinta] = pasosDelEspectador(antes, ahora, false);
  assert.equal(tercera.espera, entreCartas);
  assert.equal(cuarta.espera, vueltaCompleta);
  assert.deepEqual(cuarta.partida!.mesa.tablero.vueltas, [cerrada]);
  assert.deepEqual(cuarta.partida!.mesa.tablero.vueltaActual, { salida: 3, jugadas: [] });
  assert.deepEqual(cuarta.antesDelResultado!.mesa.tablero.vueltas, []);
  assert.deepEqual(cuarta.antesDelResultado!.mesa.tablero.vueltaActual?.jugadas, cerrada.jugadas);
  assert.equal(quinta.partida, ahora);
});

test("datosDelEspectador: el historial con la frase del pie, las vueltas y los cobros por equipo", () => {
  const m = observadaDe({
    vueltaActual: vueltaDeDos, acciones: accionesDeDos,
    indicaciones: [{ emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 1 }],
    cobros: [{ equipo: 1, tantos: 2, motivo: "envido", asiento: 1, tantoGanador: 31 }],
  });
  const datos = datosDelEspectador(m, mesaDeEspectador(m));
  assert.equal(datos.encabezado, "Mano 3 · Vuelta 1");
  assert.deepEqual(datos.historial, ["Diego jugó 7 de oros.", "Clara le dijo a Ana «Vení».", "Clara jugó 4 de copas."]);
  assert.equal(datos.cuenta, null);
  assert.deepEqual(datos.cobrados, {
    titulo: "Tantos cobrados", filas: [{ equipo: "Equipo 2 · 2 tantos", texto: "por envido (Diego con 31)" }],
  });
});

test("espectador: una carta y un envido que llegan juntos dan dos pasos, el segundo con la voz del canto", () => {
  const antes = versionarObservada(observadaDe({
    vueltaActual: { salida: 1, jugadas: [vueltaDeDos.jugadas[0]] }, acciones: [accionesDeDos[0]],
  }));
  const ahora = versionarObservada(observadaDe({
    vueltaActual: vueltaDeDos, acciones: [...accionesDeDos, { tipo: "envido", asiento: 3 }],
  }));
  const [carta, canto, ...resto] = pasosDelEspectador(antes, ahora, false);
  assert.equal(resto.length, 0);
  assert.equal(carta.espera, entreCartas);
  assert.equal(carta.voz, undefined);
  assert.equal(carta.partida!.mesa.tablero.acciones.length, 2);
  assert.equal(canto.espera, pausaDeVoz);
  assert.deepEqual(canto.voz, { asiento: 3, texto: "Envido", indice: 0 });
  assert.equal(canto.partida, ahora);
});

test("seguirConsulta: tras un corte o una mano salteada, la reconexión sube y la mesa aparece al día", () => {
  let s = seguimientoInicial;
  s = seguirConsulta(s, "listo", 3);
  assert.equal(s.reconexion, 0);
  assert.equal(seguirConsulta(s, "listo", 3), s);
  assert.equal(seguirConsulta(s, "listo", 4).reconexion, 0);
  const cortada = seguirConsulta(s, "error", 3);
  assert.equal(cortada.reconexion, 0);
  assert.equal(seguirConsulta(cortada, "error", 3), cortada);
  const vuelta = seguirConsulta(cortada, "listo", 3);
  assert.equal(vuelta.reconexion, 1);
  assert.equal(seguirConsulta(vuelta, "listo", 3), vuelta);
  assert.equal(seguirConsulta(vuelta, "listo", 5).reconexion, 2);
  assert.equal(seguirConsulta(seguimientoInicial, "cargando", undefined), seguimientoInicial);
});

test("espectador: un envido querido que llega junto muestra en cada paso su voz, y la frase del pie manda", () => {
  const antes = versionarObservada(observadaDe({ vueltaActual: vueltaDeDos, acciones: accionesDeDos }));
  const ahora = versionarObservada(observadaDe({
    vueltaActual: vueltaDeDos,
    acciones: [...accionesDeDos, { tipo: "envido", asiento: 3 }, { tipo: "quiero", asiento: 0 }],
    cobros: [{ equipo: 0, tantos: 2, motivo: "envido", asiento: 0, tantoGanador: 27 }],
  }));
  const pasos = pasosDelEspectador(antes, ahora, false);
  const mostradas = pasos.map(p => mesaDeEspectador(p.partida!.mesa, { voz: p.voz }).voces);
  assert.deepEqual(mostradas, [
    [{ asiento: 3, texto: "Envido", indice: 0 }],
    [{ asiento: 0, texto: "Quiero", indice: 0 }],
  ]);
  const cuenta = { asiento: 0, texto: "27 de envido", indice: 1 };
  assert.deepEqual(mesaDeEspectador(ahora.mesa, { voz: cuenta }).voces, [cuenta]);
  const conFrase = observadaDe({
    vueltaActual: vueltaDeDos, acciones: accionesDeDos,
    indicaciones: [{ emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 2 }],
  });
  assert.deepEqual(mesaDeEspectador(conFrase, { voz: cuenta }).voces, [{ asiento: 2, texto: "Ana, vení", indice: 0 }]);
});
