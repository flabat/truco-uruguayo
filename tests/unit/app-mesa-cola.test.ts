import assert from "node:assert/strict";
import test from "node:test";
import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { pasosDeVueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import { entreCartas, vueltaCompleta, type Paso } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { pausaDeVoz } from "@eltruco/cliente/voces.ts";
import {
  avanzar, colaInicial, duracion, enPantalla, esperaDelPaso, eventosAlAbrir, esperaDelReparto, eventosEnPantalla, eventosEntre, recibir,
} from "../../app/src/mesa/cola.ts";
import { partidaDe, vistaDe } from "./fixtures/app-mesa.ts";

type Recibida = Partida | undefined;
const pasos = pasosDeVueltas;

// 2 contra 2 visto desde el asiento 0; sale el 1, así que juegan tres computadoras antes que vos.
const antesDeLosBots = partidaDe(vistaDe(4, 0, { mano: 1, dador: 0, turno: 1, vueltaActual: { salida: 1, jugadas: [] } }));
const jugadasDeBots = [
  { tipo: "carta", asiento: 1, carta: "copas-12" },
  { tipo: "carta", asiento: 2, carta: "oros-03" },
  { tipo: "carta", asiento: 3, carta: "bastos-06" },
] as const;
const despuesDeLosBots = partidaDe(vistaDe(4, 0, {
  mano: 1, dador: 0, turno: 0, legales: ["carta"],
  acciones: [...jugadasDeBots],
  vueltaActual: { salida: 1, jugadas: jugadasDeBots.map(({ asiento, carta }) => ({ asiento, carta })) },
}), { version: 2 });

test("tres cartas de computadoras en una actualización se presentan de a una", () => {
  const inicial = colaInicial<Recibida>(antesDeLosBots, false, 0, pasos);
  assert.deepEqual(inicial.pasos, []);
  const cola = recibir<Recibida>(inicial, despuesDeLosBots, false, 0, pasos);
  assert.equal(cola.pasos.length, 3);
  const primera = enPantalla(cola);
  assert.equal(primera.presentando, true);
  assert.deepEqual(primera.partida!.vista.vueltaActual?.jugadas.map(j => j.asiento), [1]);

  const tercera = avanzar(avanzar(cola));
  assert.equal(tercera.pasos.length, 1);
  const ultima = enPantalla(tercera);
  assert.equal(ultima.partida, despuesDeLosBots);
  assert.equal(ultima.presentando, false, "quien tiene que jugar no espera el último paso");
  assert.deepEqual(enPantalla(avanzar(tercera)), { partida: despuesDeLosBots, presentando: false, voz: undefined });
});

test("recibir la misma versión no cambia la cola", () => {
  const cola = recibir<Recibida>(colaInicial<Recibida>(antesDeLosBots, false, 0, pasos), despuesDeLosBots, false, 0, pasos);
  assert.equal(recibir<Recibida>(cola, despuesDeLosBots, false, 0, pasos), cola);
});

test("otra lectura de la misma versión se muestra aunque no cambie la cola", () => {
  const vista = vistaDe(2, 0, { turno: 0 });
  const primera = partidaDe(vista);
  const conPie = partidaDe(vista, { pie: { vuelta: 1 } as Partida["pie"] });
  const cola = recibir<Recibida>(colaInicial<Recibida>(primera, false, 0, pasos), conPie, false, 0, pasos);
  assert.equal(cola.recibida, conPie);
  assert.equal(enPantalla(cola).partida, conPie);
});

test("un paso al día muestra la lectura más reciente de su versión", () => {
  const envido = en1v1({ acciones: [{ tipo: "envido", asiento: 1 }] });
  const cola = recibir<Recibida>(colaInicial<Recibida>(inicio1v1, false, 0, pasos), envido, false, 0, pasos);
  assert.equal(cola.pasos[0].partida, envido, "la voz del rival muestra la partida recibida");
  const releida = { ...envido };
  const nueva = recibir<Recibida>(cola, releida, false, 0, pasos);
  assert.deepEqual(enPantalla(nueva), { partida: releida, presentando: false, voz: cola.pasos[0].voz });
});

test("una reconexión vacía la cola y muestra lo recibido", () => {
  const cola = recibir<Recibida>(colaInicial<Recibida>(antesDeLosBots, false, 0, pasos), despuesDeLosBots, false, 0, pasos);
  const reconectada = recibir<Recibida>(cola, despuesDeLosBots, false, 1, pasos);
  assert.deepEqual(reconectada.pasos, []);
  assert.equal(reconectada.reconexion, 1);
  assert.deepEqual(enPantalla(reconectada), { partida: despuesDeLosBots, presentando: false, voz: undefined });
});

test("abrir una mesa en curso muestra el estado sin presentar el pasado", () => {
  const cola = colaInicial<Recibida>(despuesDeLosBots, false, 0, pasos);
  assert.deepEqual(cola.pasos, []);
  assert.equal(enPantalla(cola).partida, despuesDeLosBots);
});

test("la vuelta completa se ve en el paño antes del veredicto y en el avance siguiente se cierra", () => {
  const antes = partidaDe(vistaDe(2, 0, {
    turno: 1, acciones: [{ tipo: "carta", asiento: 0, carta: "espadas-01" }],
    cartas: ["oros-07", "copas-04"], vueltaActual: { salida: 0, jugadas: [{ asiento: 0, carta: "espadas-01" }] },
  }));
  const jugadas = [{ asiento: 0, carta: "espadas-01" }, { asiento: 1, carta: "copas-12" }] as const;
  const cerrada = partidaDe(vistaDe(2, 0, {
    turno: 0, legales: ["carta"], cartas: ["oros-07", "copas-04"],
    acciones: jugadas.map(j => ({ tipo: "carta" as const, ...j })),
    vueltaActual: { salida: 0, jugadas: [] },
    vueltas: [{ salida: 0, jugadas: [...jugadas], resultado: { tipo: "ganada", equipo: 0, asiento: 0 } }],
  }), { version: 2 });
  const cola = recibir<Recibida>(colaInicial<Recibida>(antes, false, 0, pasos), cerrada, false, 0, pasos);
  assert.equal(cola.pasos.length, 1);
  const antesDelVeredicto = enPantalla(cola);
  assert.equal(antesDelVeredicto.presentando, true);
  assert.equal(antesDelVeredicto.partida!.vista.vueltas.length, 0);
  assert.equal(antesDelVeredicto.partida!.vista.vueltaActual?.jugadas.length, 2);

  const cargada = avanzar(cola);
  assert.equal(cargada.cargado, cola.pasos[0]);
  assert.equal(enPantalla(cargada).partida!.vista.vueltas.length, 1);
  assert.equal(enPantalla(cargada).presentando, true);
  assert.deepEqual(avanzar(cargada).pasos, []);
});

test("duracion normal y liviana", () => {
  const carta: Paso<unknown> = { partida: null, espera: entreCartas };
  const vuelta: Paso<unknown> = { partida: null, espera: vueltaCompleta };
  const voz: Paso<unknown> = { partida: null, espera: pausaDeVoz, voz: { asiento: 1, texto: "Truco", indice: 0 } };
  assert.deepEqual([carta, vuelta, voz].map(p => duracion(p, false)), [450, 2000, 1500]);
  assert.deepEqual([carta, vuelta, voz].map(p => duracion(p, true)), [250, 1200, 1500]);
});

const inicio1v1 = partidaDe(vistaDe(2, 0, { turno: 1 }));
function en1v1(cambios: Parameters<typeof vistaDe>[2], partida: Parameters<typeof partidaDe>[1] = {}) {
  return partidaDe(vistaDe(2, 0, cambios), { version: 2, ...partida });
}

test("eventosEntre: la carta del rival no es propia y la tuya sí", () => {
  const rival = en1v1({ acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" }] });
  assert.deepEqual(eventosEntre(inicio1v1, rival, 0), [{ tipo: "carta", asiento: 1, carta: "copas-12", propia: false }]);
  const propia = en1v1({ acciones: [{ tipo: "carta", asiento: 0, carta: "espadas-01" }] });
  assert.deepEqual(eventosEntre(inicio1v1, propia, 0), [{ tipo: "carta", asiento: 0, carta: "espadas-01", propia: true }]);
});

test("eventosEntre: el envido del rival en 1 contra 1 es para vos", () => {
  const envido = en1v1({ acciones: [{ tipo: "envido", asiento: 1 }] });
  assert.deepEqual(eventosEntre(inicio1v1, envido, 0), [{ tipo: "canto", asiento: 1, texto: "Envido", paraMi: true }]);
  const quiero = en1v1({ acciones: [{ tipo: "envido", asiento: 0 }, { tipo: "quiero", asiento: 1 }] });
  assert.deepEqual(eventosEntre(en1v1({ acciones: [{ tipo: "envido", asiento: 0 }] }), quiero, 0),
    [{ tipo: "canto", asiento: 1, texto: "Quiero", paraMi: false }], "una respuesta no te pide nada");
});

test("eventosEntre: la declaración de tantos llega después del canto que la cierra", () => {
  const acciones = [{ tipo: "envido", asiento: 0 }, { tipo: "quiero", asiento: 1 }] as const;
  const declarada = en1v1({
    acciones: [...acciones], indiceCobroLateral: 1,
    cobros: [{ equipo: 1, tantos: 2, motivo: "envido", asiento: 1, tantoGanador: 31 }],
  });
  assert.deepEqual(eventosEntre(en1v1({ acciones: [acciones[0]] }), declarada, 0), [
    { tipo: "canto", asiento: 1, texto: "Quiero", paraMi: false },
    { tipo: "canto", asiento: 1, texto: "31 de envido", paraMi: false },
    { tipo: "cobro", equipo: 1, tantos: 2, nuestro: false },
  ]);
});

test("eventosEntre: un cobro del equipo propio es nuestro y uno ajeno no", () => {
  const antes = partidaDe(vistaDe(4, 0));
  const cobrado = partidaDe(vistaDe(4, 0, { cobros: [{ equipo: 0, tantos: 2, motivo: "envido" }] }), { version: 2 });
  assert.deepEqual(eventosEntre(antes, cobrado, 2), [{ tipo: "cobro", equipo: 0, tantos: 2, nuestro: true }]);
  assert.deepEqual(eventosEntre(antes, cobrado, 1), [{ tipo: "cobro", equipo: 0, tantos: 2, nuestro: false }]);
  const conTruco = partidaDe(vistaDe(4, 0, {
    cobros: [{ equipo: 1, tantos: 1, motivo: "truco" }, { equipo: 0, tantos: 2, motivo: "envido" }],
  }), { version: 3 });
  assert.deepEqual(eventosEntre(cobrado, conTruco, 2), [{ tipo: "cobro", equipo: 1, tantos: 1, nuestro: false }],
    "un cobro que ya estaba no se repite aunque cambie de lugar");
});

test("eventosEntre: la vuelta ganada por tu pareja es nuestra", () => {
  const antes = partidaDe(vistaDe(4, 0));
  const ganada = partidaDe(vistaDe(4, 0, {
    vueltas: [{ salida: 0, jugadas: [], resultado: { tipo: "ganada", equipo: 0, asiento: 2 } }],
  }), { version: 2 });
  assert.deepEqual(eventosEntre(antes, ganada, 0), [{ tipo: "vuelta", ganador: 2, nuestra: true }]);
  const parda = partidaDe(vistaDe(4, 0, { vueltas: [{ salida: 0, jugadas: [], resultado: { tipo: "parda" } }] }), { version: 2 });
  assert.deepEqual(eventosEntre(antes, parda, 0), [{ tipo: "vuelta", ganador: null, nuestra: false }]);
});

test("eventosEntre: una mano nueva es un reparto y un chico ganado se festeja", () => {
  const cerrada = en1v1({ acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" }] });
  const siguiente = partidaDe(vistaDe(2, 0, { dador: 0, mano: 1 }), { manoNumero: 2, version: 3 });
  assert.deepEqual(eventosEntre(cerrada, siguiente, 0), [{ tipo: "reparto", dador: 0 }]);
  const ganado = partidaDe(vistaDe(2, 0), { version: 2, ganadorPartida: 0, contexto: { versionVista: 1, fase: "chico-terminado" } });
  assert.deepEqual(eventosEntre(inicio1v1, ganado, 0), [{ tipo: "chico", nuestro: true }]);
  assert.deepEqual(eventosEntre(inicio1v1, ganado, 1), [{ tipo: "chico", nuestro: false }]);
});

test("eventosEntre: una frase del pie es para su destinatario", () => {
  const antes = partidaDe(vistaDe(4, 0));
  const frase = partidaDe(vistaDe(4, 0), {
    version: 2, indicaciones: [{ emisor: 2, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 0 }],
  });
  assert.deepEqual(eventosEntre(antes, frase, 0), [{ tipo: "frase", emisor: 2, destinatario: 0, texto: "Vení", paraMi: true }]);
  assert.deepEqual(eventosEntre(antes, frase, 2)[0], { tipo: "frase", emisor: 2, destinatario: 0, texto: "Vení", paraMi: false });
  const nombres = ["Clara", "Diego", "Ana", "Beto"];
  assert.equal((eventosEntre(antes, frase, 0, a => nombres[a])[0] as { texto: string }).texto, "Clara, vení");
});

test("eventosEntre: al abrir la mesa no hay eventos", () => {
  assert.deepEqual(eventosEntre(undefined, despuesDeLosBots, 0), []);
});

test("eventosEntre: para un espectador nada es suyo", () => {
  const antes = partidaDe(vistaDe(4, 0));
  const todo = partidaDe(vistaDe(4, 0, {
    acciones: [{ tipo: "carta", asiento: 0, carta: "espadas-01" }, { tipo: "envido", asiento: 1 }],
    vueltas: [{ salida: 0, jugadas: [], resultado: { tipo: "ganada", equipo: 0, asiento: 0 } }],
    cobros: [{ equipo: 0, tantos: 2, motivo: "envido" }],
  }), {
    version: 2, ganadorPartida: 0,
    indicaciones: [{ emisor: 2, destinatario: 0, frase: "juga", vuelta: 1, indiceAccion: 0 }],
  });
  const eventos = eventosEntre(antes, todo, null);
  assert.deepEqual(eventos.map(e => e.tipo), ["carta", "canto", "frase", "vuelta", "cobro", "chico"]);
  for (const e of eventos) {
    const suyo = "propia" in e ? e.propia : "paraMi" in e ? e.paraMi : "nuestra" in e ? e.nuestra : "nuestro" in e ? e.nuestro : false;
    assert.equal(suyo, false, e.tipo);
  }
});

test("eventosEntre: los cantos propios no suenan; las voces que responden, sí", () => {
  assert.deepEqual(eventosEntre(inicio1v1, en1v1({ acciones: [{ tipo: "truco", asiento: 0 }] }), 0), []);
  const respondido = en1v1({ acciones: [{ tipo: "truco", asiento: 0 }, { tipo: "retruco", asiento: 1 }] });
  assert.deepEqual(eventosEntre(inicio1v1, respondido, 0), [{ tipo: "canto", asiento: 1, texto: "Retruco", paraMi: true }]);
});

test("eventosEnPantalla: un salto sin paso solo avisa el reparto", () => {
  const vieja = { partida: en1v1({ acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" }] }) };
  const nueva = { partida: partidaDe(vistaDe(2, 0, {
    dador: 0, mano: 1, acciones: [{ tipo: "carta", asiento: 1, carta: "oros-03" }, { tipo: "envido", asiento: 1 }],
    vueltaActual: { salida: 1, jugadas: [{ asiento: 1, carta: "oros-03" }] },
  }), { manoNumero: 3, version: 9 }) };
  assert.deepEqual(eventosEnPantalla(vieja, nueva, false, 0), [{ tipo: "reparto", dador: 0 }]);
  const enLaMisma = { partida: en1v1({ acciones: [{ tipo: "carta", asiento: 1, carta: "copas-12" },
    { tipo: "carta", asiento: 0, carta: "espadas-01" }] }, { version: 5 }) };
  assert.deepEqual(eventosEnPantalla(vieja, enLaMisma, false, 0), [], "las cartas perdidas no se animan");
  assert.equal(eventosEnPantalla(vieja, enLaMisma, true, 0).length, 1, "con un paso, la carta sí se anima");
});

test("eventosEnPantalla: sin paso, lo que completa la última jugada mostrada sí suena", () => {
  const acciones = [{ tipo: "truco", asiento: 1 }, { tipo: "no-quiero", asiento: 0 }] as const;
  const dicho = en1v1({ acciones: [...acciones] });
  const cobrado = en1v1({ acciones: [...acciones], cobros: [{ equipo: 1, tantos: 1, motivo: "truco" }] }, { version: 3 });
  assert.deepEqual(eventosEnPantalla({ partida: dicho }, { partida: cobrado }, false, 0),
    [{ tipo: "cobro", equipo: 1, tantos: 1, nuestro: false }]);
  assert.deepEqual(eventosEnPantalla({ partida: en1v1({ acciones: [acciones[0]] }) }, { partida: cobrado }, false, 0),
    [{ tipo: "cobro", equipo: 1, tantos: 1, nuestro: false }], "el canto propio no es un salto");
});

test("eventosEnPantalla: las voces que comparten partida suenan una por paso", () => {
  const acciones = [{ tipo: "envido", asiento: 0 }, { tipo: "quiero", asiento: 1 }] as const;
  const antes = { partida: en1v1({ acciones: [acciones[0]] }) };
  // El paso de las voces todavía no muestra el cobro: queda público después de las declaraciones.
  const parcial = en1v1({ acciones: [...acciones] });
  const quiero = { asiento: 1, texto: "Quiero", indice: 0 };
  const tantos = { asiento: 1, texto: "31 de envido", indice: 1 };
  assert.deepEqual(eventosEnPantalla(antes, { partida: parcial, voz: quiero }, true, 0),
    [{ tipo: "canto", asiento: 1, texto: "Quiero", paraMi: false }]);
  assert.deepEqual(eventosEnPantalla({ partida: parcial, voz: quiero }, { partida: parcial, voz: tantos }, true, 0),
    [{ tipo: "canto", asiento: 1, texto: "31 de envido", paraMi: false }]);
  assert.deepEqual(eventosEnPantalla({ partida: parcial, voz: tantos }, { partida: parcial, voz: tantos }, true, 0), []);
});

test("eventosEnPantalla: tu canto seguido de la voz del rival suena solo la del rival", () => {
  const conRetruco = en1v1({ acciones: [{ tipo: "truco", asiento: 0 }, { tipo: "retruco", asiento: 1 }] });
  const retruco = { asiento: 1, texto: "Retruco", indice: 0 };
  assert.deepEqual(eventosEnPantalla({ partida: inicio1v1 }, { partida: conRetruco, voz: retruco }, true, 0),
    [{ tipo: "canto", asiento: 1, texto: "Retruco", paraMi: true }]);
});

function tercetos(duelo: 1 | 2, archivados: number, acciones: Partida["vista"]["acciones"], version: number): PartidaTercetos {
  const base = partidaDe(vistaDe(2, 0, { acciones: [...acciones] }), { version, meta: 30 });
  return { ...base, formato: "triples", lance: { tipo: "pico-a-pico", duelo, activos: [0, 1] },
    historialLances: Array(archivados).fill({}), vista: { ...base.vista, estado: "jugando" } } as unknown as PartidaTercetos;
}

test("eventosEntre en tercetos: un duelo nuevo trae sus propias cartas y archivar el duelo no las repite", () => {
  const cartas = [{ tipo: "carta", asiento: 0, carta: "espadas-01" }, { tipo: "carta", asiento: 1, carta: "copas-12" }] as const;
  const duelo1 = tercetos(1, 0, [...cartas], 2);
  const archivado = tercetos(1, 1, [...cartas], 2);
  assert.deepEqual(eventosEntre(duelo1, archivado, 0), []);
  const duelo2 = tercetos(2, 1, [{ tipo: "carta", asiento: 1, carta: "oros-03" }], 3);
  assert.deepEqual(eventosEntre(archivado, duelo2, 0), [{ tipo: "carta", asiento: 1, carta: "oros-03", propia: false }]);
});

test("un paso que trae un reparto espera a que se den vuelta las cartas antes de avanzar", () => {
  const siguiente = partidaDe(vistaDe(4, 0, { dador: 0, mano: 1 }), { manoNumero: 2, version: 3 });
  const reparto = [{ tipo: "reparto", dador: 0 } as const];
  // 12 cartas cada 80 ms, 320 ms la última y las tres propias se dan vuelta de a una.
  assert.equal(esperaDelReparto(reparto, siguiente, false), 11 * 80 + 320 + 2 * 80 + 320);
  assert.equal(esperaDelReparto(reparto, partidaDe(vistaDe(2, 0)), false), 5 * 80 + 320 + 2 * 80 + 320);
  assert.equal(esperaDelReparto(reparto, siguiente, true), 0, "en liviano no hay reparto animado");
  assert.equal(esperaDelReparto([{ tipo: "chico", nuestro: true }], siguiente, false), 0);

  const carta: Paso<unknown> = { partida: null, espera: entreCartas };
  // El reparto terminó de anunciarse en t = 1000 y dura hasta t = 2680: el paso espera lo que falta.
  assert.equal(esperaDelPaso(carta, false, 2680, 1000), entreCartas + 1680);
  assert.equal(esperaDelPaso(carta, false, 2680, 3000), entreCartas, "un reparto ya terminado no demora");
  assert.equal(esperaDelPaso(carta, true, 0, 3000), 250);
});

test("la primera mano de una mesa presenciada se reparte a la vista aunque no haya estado anterior", () => {
  const primera = partidaDe(vistaDe(4, 0, { dador: 3, mano: 0 }), { manoNumero: 1 });
  assert.deepEqual(eventosAlAbrir(primera, true), [{ tipo: "reparto", dador: 3 }]);
  assert.deepEqual(eventosAlAbrir(primera, false), [], "sin presenciarla, la mesa aparece repartida");
  const segunda = partidaDe(vistaDe(4, 0, { dador: 0, mano: 1 }), { manoNumero: 2 });
  assert.deepEqual(eventosAlAbrir(segunda, true), [], "una mano posterior ya no es el reparto que se vio");
  assert.deepEqual(eventosAlAbrir(undefined, true), []);
});
