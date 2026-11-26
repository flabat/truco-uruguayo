import assert from "node:assert/strict";
import test from "node:test";
import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { estadoDelTurno, palabraDeTercetos, tanteador, tituloDeRespuesta } from "@eltruco/cliente/turno.ts";
import { vueltaEnMesa } from "@eltruco/cliente/vuelta-en-mesa.ts";
import { vocesEnAccion, vocesEnReposo } from "@eltruco/cliente/voces.ts";
import { descripcionDeJugada, nombrar, tantos } from "@eltruco/cliente/textos.ts";

const nombres = ["Ana", "Beto", "Caro", "Dani"];
function mesa(jugadores: number, miAsiento = 0): Mesa {
  return {
    id: "m1", modo: jugadores === 2 ? "1v1" : "2v2", meta: 30, publica: false, creadorId: "j0", miAsiento,
    invitacion: "i", lista: true,
    asientos: nombres.slice(0, jugadores).map((nombre, asiento) => ({ asiento, equipo: (asiento % 2) as 0 | 1, tipo: "humano", nombre })),
  };
}
function vista(cambios: Partial<VistaOnline>): VistaOnline {
  return {
    resultado: null, pendiente: null, porDeclararFlor: null, turno: null, legales: [], acciones: [], cobros: [],
    vueltas: [], vueltaActual: null, ...cambios,
  } as unknown as VistaOnline;
}
const partida = (fase = "en-juego") => ({ contexto: { versionVista: 1, fase } }) as unknown as Partida;
const nombre = (a: number) => nombres[a];

test("el título de respuesta nombra al rival en duelo y al equipo en parejas", () => {
  const pendiente = { tipo: "truco", asiento: 0 } as const;
  assert.equal(tituloDeRespuesta(mesa(2), vista({ pendiente }), [0, 1]), "Responde Beto");
  assert.equal(tituloDeRespuesta(mesa(4), vista({ pendiente }), [0, 1, 2, 3]), "Responde el equipo rival");
  assert.equal(tituloDeRespuesta(mesa(4), vista({ pendiente: { tipo: "truco", asiento: 1 } }), [0, 1, 2, 3]), "Responde tu equipo");
  assert.equal(tituloDeRespuesta(mesa(4), vista({ pendiente, legales: ["quiero"] }), [0, 1, 2, 3]), "Podés responder");
});

test("el estado del turno cubre cierre, flor, canto pendiente y turnos", () => {
  const m = mesa(2);
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ resultado: { equipo: 0, motivo: "vueltas", tantos: 1 } as VistaOnline["resultado"] })),
    { titulo: "Ganaste la mano", indicacion: "El cierre fue por las vueltas." });
  assert.deepEqual(estadoDelTurno(m, partida("chico-terminado"), vista({ resultado: { equipo: 1, motivo: "mazo", tantos: 1 } as VistaOnline["resultado"] })),
    { titulo: "Ganó el rival", indicacion: "Ana se fue al mazo." });
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ porDeclararFlor: 0, legales: ["paso-flor"] })),
    { titulo: "Te toca declarar", indicacion: "No tenés flor en esta mano." });
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ porDeclararFlor: 1 })),
    { titulo: "Declara Beto", indicacion: "Esperando su declaración de flor." });
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ pendiente: { tipo: "envido", asiento: 1 }, legales: ["quiero", "flor"] })),
    { titulo: "Podés responder", indicacion: "Beto tocó envido. Cantá tu flor para responder." });
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ turno: 0, legales: ["carta", "truco"] })),
    { titulo: "Tu turno", indicacion: "Elegí una carta en el tapete o hacé un canto." });
  assert.deepEqual(estadoDelTurno(m, partida(), vista({ turno: 1 })),
    { titulo: "Turno de Beto", indicacion: "Esperando la jugada." });
});

test("la palabra de tercetos anuncia el fin del chico y el reparto cerrado", () => {
  const base = { vista: vista({}), lance: { activos: [0, 1] }, ganadorPartida: 0 };
  const con = (fase: string) => ({ ...base, contexto: { versionVista: 1, fase } }) as unknown as PartidaTercetos;
  assert.equal(palabraDeTercetos(mesa(4), con("chico-terminado")), "Tu equipo ganó el chico");
  assert.equal(palabraDeTercetos(mesa(4, 1), con("chico-terminado")), "El rival ganó el chico");
  assert.equal(palabraDeTercetos(mesa(4), con("reparto-cerrado")), "Reparto terminado");
});

test("el tanteador pone primero al equipo propio con malas y buenas", () => {
  assert.deepEqual(tanteador(30, [3, 16], 1, e => e === 1 ? "Tu equipo" : "Rivales"), {
    meta: "Chico a 30", detalle: "Acumulado · 15 malas y 15 buenas",
    equipos: [
      { equipo: 1, nombre: "Tu equipo", puntos: 16, cuenta: "1 buena" },
      { equipo: 0, nombre: "Rivales", puntos: 3, cuenta: "3 malas" },
    ],
  });
});

test("la vuelta en mesa relata la carta ganadora y la parda", () => {
  const ganada = vueltaEnMesa(vista({ vueltas: [{ salida: 0, jugadas: [{ asiento: 0, carta: "espadas-01" }, { asiento: 1, carta: "copas-04" }],
    resultado: { tipo: "ganada", asiento: 0 } }] as unknown as VistaOnline["vueltas"] }), 2, nombre);
  assert.equal(ganada.numeroVuelta, 1);
  assert.equal(ganada.detalleVuelta, "Beto jugó 4 de copas. Ana ganó la vuelta con su as de espadas.");
  const parda = vueltaEnMesa(vista({ vueltas: [{ salida: 0, jugadas: [{ asiento: 0, carta: "oros-07" }, { asiento: 1, carta: "copas-07" }],
    resultado: { tipo: "parda" } }] as unknown as VistaOnline["vueltas"] }), 2, nombre);
  assert.equal(parda.detalleVuelta, "Beto jugó 7 de copas. La vuelta fue parda.");
});

test("las voces de una flor querida muestran las cuentas al volver", () => {
  const lance = {
    acciones: [{ tipo: "flor", asiento: 0 }, { tipo: "flor", asiento: 1 }, { tipo: "quiero", asiento: 0 }],
    cobros: [{ equipo: 0, tantos: 6, motivo: "flor", asiento: 0, tantoGanador: 33,
      comparacionFlor: { indiceAccion: 2, participantes: [{ asiento: 0, total: 33 }, { asiento: 1, total: 28 }] } }],
    resultado: { equipo: 0, motivo: "flor", tantos: 6 },
  } as unknown as Parameters<typeof vocesEnReposo>[0];
  assert.deepEqual(vocesEnAccion(lance, 0), [{ asiento: 0, texto: "Flor", indice: 0 }]);
  assert.deepEqual(vocesEnReposo(lance), [
    { asiento: 0, texto: "33 de flor", indice: 1 },
    { asiento: 1, texto: "28 de flor", indice: 2 },
  ]);
});

test("las voces de un envido querido dicen «Son buenas» sin mostrar el tanto", () => {
  const lance = {
    acciones: [{ tipo: "envido", asiento: 0 }, { tipo: "real-envido", asiento: 1 }, { tipo: "quiero", asiento: 0 }],
    cobros: [{ equipo: 1, tantos: 5, motivo: "envido", asiento: 1, tantoGanador: 31,
      comparacionEnvido: { indiceAccion: 2, participantes: [{ asiento: 0, total: 27 }, { asiento: 1, total: 31 }] } }],
    indiceCobroLateral: 2,
  } as unknown as Parameters<typeof vocesEnReposo>[0];
  assert.deepEqual(vocesEnReposo(lance), [
    { asiento: 0, texto: "27 de envido", indice: 1 },
    { asiento: 1, texto: "31 de envido", indice: 2 },
  ]);
  const perdida = { ...lance, cobros: [{ ...lance.cobros[0], equipo: 0, asiento: 0, tantoGanador: 33,
    comparacionEnvido: { indiceAccion: 2, participantes: [{ asiento: 0, total: 33 }, { asiento: 1, total: null }] } }] };
  assert.deepEqual(vocesEnAccion(perdida, 2).slice(1), [
    { asiento: 0, texto: "33 de envido", indice: 1 },
    { asiento: 1, texto: "Son buenas", indice: 2 },
  ]);
});

test("los textos de jugadas nombran cartas y tantos", () => {
  assert.equal(nombrar("bastos-11"), "Caballo de bastos");
  assert.equal(tantos(1), "1 tanto");
  assert.equal(descripcionDeJugada([{ tipo: "mazo", asiento: 1 }], 0, nombre), "Beto se fue al mazo.");
  assert.equal(descripcionDeJugada([{ tipo: "carta", asiento: 0, carta: "oros-12" }], 0, nombre), "Ana jugó rey de oros.");
});

test("la flor que contesta una subida rival sin quererla se anota como «Con flor me achico»", () => {
  const rechazo = [{ tipo: "contraflor-al-resto", asiento: 0 }, { tipo: "flor", asiento: 1 }] as const;
  assert.equal(descripcionDeJugada(rechazo, 1, nombre), "Beto dijo «Con flor me achico».");
  assert.equal(descripcionDeJugada([{ tipo: "con-flor-envido", asiento: 0 }, { tipo: "flor", asiento: 1 }], 1, nombre),
    "Beto dijo «Con flor me achico».");
  // Sin subida, del mismo equipo o ya querida, «Flor» solo declara la flor.
  assert.equal(descripcionDeJugada([{ tipo: "flor", asiento: 0 }, { tipo: "flor", asiento: 1 }], 1, nombre), "Beto dijo «Flor».");
  assert.equal(descripcionDeJugada([{ tipo: "contraflor-al-resto", asiento: 0 }, { tipo: "flor", asiento: 2 }], 1, nombre),
    "Caro dijo «Flor».");
  assert.equal(descripcionDeJugada([{ tipo: "contraflor-al-resto", asiento: 0 }, { tipo: "con-flor-quiero", asiento: 1 },
    { tipo: "flor", asiento: 3 }], 2, nombre), "Dani dijo «Flor».");
});
