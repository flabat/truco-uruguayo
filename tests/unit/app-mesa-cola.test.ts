import assert from "node:assert/strict";
import test from "node:test";
import type { Partida } from "@eltruco/cliente/cliente.ts";
import { pasosDeVueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import { entreCartas, vueltaCompleta, type Paso } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { pausaDeVoz } from "@eltruco/cliente/voces.ts";
import { avanzar, colaInicial, duracion, enPantalla, eventosEntre, recibir } from "../../app/src/mesa/cola.ts";
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
