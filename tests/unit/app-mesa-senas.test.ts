import assert from "node:assert/strict";
import test from "node:test";
import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { versionSenasPie, type IndicacionPie, type VistaPie } from "@eltruco/motor/senas-pie.ts";
import { jugarEnSilencio, senasEnMesa } from "../../app/src/mesa/senas.ts";
import { mesaDe, partidaDe, vistaDe } from "./fixtures/app-mesa.ts";

// En parejas el equipo es 0 y 2: el pie es el 2 (Ana) y su compañera es 0 (Clara).
function mesaPie(miAsiento: number): Mesa {
  return { ...mesaDe("2v2", miAsiento), versionSenas: versionSenasPie };
}
function partidaPie(pie: VistaPie | undefined, cambios: Partial<Partida> = {}): Partida {
  return partidaDe(vistaDe(4, 0, { muestra: "bastos-05" }), { versionSenas: versionSenasPie, pie, ...cambios });
}
const vistaDelPie: VistaPie = {
  pie: 2, vuelta: 1, esperando: 0,
  grupos: [{ emisor: 0, gestos: ["labio-inferior", "cejas"] }],
  opciones: [{ destinatario: 0, frases: ["juga"] }],
};

// Tercetos: el equipo 0 es 0, 2 y 4; el pie es el 4 (Eli) y sus compañeros son 0 (Clara) y 2 (Ana).
const nombres3v3 = ["Clara", "Diego", "Ana", "Beto", "Eli", "Fede"];
function mesaTercetos(miAsiento: number): Mesa {
  return {
    ...mesaDe("2v2", miAsiento), modo: "3v3", formato: "triples", versionSenas: versionSenasPie,
    asientos: nombres3v3.map((nombre, asiento) => ({ asiento, equipo: (asiento % 2) as 0 | 1, tipo: "humano", nombre })),
  };
}
function partidaTercetos(pie: VistaPie, lance: unknown = { tipo: "redondilla", duelo: null, activos: [0, 1, 2, 3, 4, 5] }) {
  return {
    ...partidaDe(vistaDe(4, 4)), formato: "triples", versionSenas: versionSenasPie, pie, lance, historialLances: [],
  } as unknown as PartidaTercetos;
}
const vistaTercetos: VistaPie = {
  pie: 4, vuelta: 1, esperando: 0,
  grupos: [
    { emisor: 0, gestos: ["labio-inferior", "cejas"] },
    { emisor: 2, gestos: ["lengua"] },
  ],
  opciones: [{ destinatario: 0, frases: ["juga"] }, { destinatario: 2, frases: ["voy-a-vos"] }],
};

test("un espectador nunca ve señas aunque la partida traiga el pie", () => {
  const r = senasEnMesa({ mesa: mesaPie(2), partida: partidaPie(vistaDelPie), espectador: true });
  assert.deepEqual(r, { tipo: "ninguna" });
});

test("un rival no ve las señas aunque el servidor las mande", () => {
  const mesa = mesaPie(1);
  assert.equal(mesa.asientos[2].equipo, 0);
  assert.deepEqual(senasEnMesa({ mesa, partida: partidaPie(vistaDelPie), espectador: false }), { tipo: "ninguna" });
});

test("en 1 contra 1 no hay señas", () => {
  const mesa = { ...mesaDe("1v1", 0), versionSenas: versionSenasPie };
  const partida = partidaDe(vistaDe(2, 0), { versionSenas: versionSenasPie, pie: { ...vistaDelPie, pie: 0 } });
  assert.deepEqual(senasEnMesa({ mesa, partida, espectador: false }), { tipo: "ninguna" });
});

test("sin pie en la partida no hay señas", () => {
  assert.deepEqual(senasEnMesa({ mesa: mesaPie(2), partida: partidaPie(undefined), espectador: false }), { tipo: "ninguna" });
});

test("si las versiones no coinciden con la de pie no se muestra nada", () => {
  const sinVersion = partidaPie(vistaDelPie, { versionSenas: "otra" });
  assert.deepEqual(senasEnMesa({ mesa: mesaPie(2), partida: sinVersion, espectador: false }), { tipo: "ninguna" });
  const mesa = { ...mesaPie(2), versionSenas: "otra" };
  assert.deepEqual(senasEnMesa({ mesa, partida: partidaPie(vistaDelPie), espectador: false }), { tipo: "ninguna" });
});

test("el pie ve un globo por compañero con el palo de la muestra y las frases", () => {
  const r = senasEnMesa({ mesa: mesaTercetos(4), partida: partidaTercetos(vistaTercetos), espectador: false });
  assert.deepEqual(r, {
    tipo: "pie", vuelta: 1,
    globos: [
      { emisor: 0, nombre: "Clara", gestos: [
        { gesto: "labio-inferior", significado: "Tres" },
        { gesto: "cejas", significado: "2 de bastos" },
      ] },
      { emisor: 2, nombre: "Ana", gestos: [{ gesto: "lengua", significado: "As de copa u oro" }] },
    ],
    frases: [
      { destinatario: 0, nombre: "Clara", frases: ["juga"], esperando: true, pedidas: [
        { carta: "labio-inferior", texto: "Jugá el tres" }, { carta: "cejas", texto: "Jugá el 2 de bastos" },
      ] },
      { destinatario: 2, nombre: "Ana", frases: ["voy-a-vos"], esperando: false, pedidas: [] },
    ],
  });
});

test("un grupo o una opción de un rival en la vista nunca aparece", () => {
  const pie: VistaPie = {
    ...vistaTercetos,
    grupos: [...vistaTercetos.grupos, { emisor: 1, gestos: ["ojos-cerrados"] }],
    opciones: [...vistaTercetos.opciones, { destinatario: 3, frases: ["veni"] }],
  };
  const r = senasEnMesa({ mesa: mesaTercetos(4), partida: partidaTercetos(pie), espectador: false });
  assert.equal(r.tipo, "pie");
  if (r.tipo === "pie") {
    assert.deepEqual(r.globos.map(g => g.emisor), [0, 2]);
    assert.deepEqual(r.frases.map(f => f.destinatario), [0, 2]);
  }
});

test("el pie sin opciones ve los globos y ninguna frase", () => {
  const pie: VistaPie = { pie: 2, vuelta: 2, grupos: vistaDelPie.grupos, opciones: [] };
  const r = senasEnMesa({ mesa: mesaPie(2), partida: partidaPie(pie), espectador: false });
  assert.equal(r.tipo, "pie");
  if (r.tipo === "pie") {
    assert.equal(r.globos.length, 1);
    assert.deepEqual(r.frases, []);
  }
});

test("el compañero que no es pie sabe a quién le mostró y qué", () => {
  const pie: VistaPie = { pie: 2, vuelta: 1, grupos: [{ emisor: 0, gestos: ["labio-inferior", "labios-derecha"] }], opciones: [] };
  const r = senasEnMesa({ mesa: mesaPie(0), partida: partidaPie(pie), espectador: false });
  assert.deepEqual(r, {
    tipo: "companero", pie: 2, texto: "Le mostraste a Ana: Tres · As bravo", gestos: ["labio-inferior", "labios-derecha"],
  });
});

test("el compañero toma su propio grupo y no el de otro asiento", () => {
  const pie: VistaPie = { pie: 4, vuelta: 1, grupos: [
    { emisor: 2, gestos: ["lengua"] }, { emisor: 0, gestos: ["boca"] },
  ], opciones: [] };
  const r = senasEnMesa({ mesa: mesaTercetos(0), partida: partidaTercetos(pie), espectador: false });
  assert.deepEqual(r, { tipo: "companero", pie: 4, texto: "Le mostraste a Eli: Dos común", gestos: ["boca"] });
});

test("el compañero sin grupo no ve nada", () => {
  const pie: VistaPie = { pie: 2, vuelta: 1, grupos: [], opciones: [] };
  assert.deepEqual(senasEnMesa({ mesa: mesaPie(0), partida: partidaPie(pie), espectador: false }), { tipo: "ninguna" });
});

test("tercetos en pico a pico no tiene señas", () => {
  const mesa = { ...mesaDe("2v2", 2), modo: "3v3", formato: "triples", versionSenas: versionSenasPie } as Mesa;
  const partida = {
    ...partidaDe(vistaDe(4, 2)), formato: "triples", versionSenas: versionSenasPie, pie: vistaDelPie,
    lance: { tipo: "pico-a-pico", duelo: 1, activos: [0, 3] }, historialLances: [],
  } as unknown as PartidaTercetos;
  assert.deepEqual(senasEnMesa({ mesa, partida, espectador: false }), { tipo: "ninguna" });
  const redondilla = { ...partida, lance: { tipo: "redondilla", duelo: null, activos: [0, 1, 2, 3, 4, 5] } } as unknown as PartidaTercetos;
  assert.equal(senasEnMesa({ mesa, partida: redondilla, espectador: false }).tipo, "pie");
});

test("la mesa legada con seña elegida a mano juega en silencio y lista solo las señas recibidas del compañero", () => {
  const mesa: Mesa = { ...mesaDe("2v2", 2), formato: "pairs-private-senas" };
  const vista = vistaDe(4, 2);
  const partida = partidaDe(vista, {
    formato: "pairs-private-senas", versionSenas: "senas-equipo-v1",
    turnos: [
      { action: { tipo: "carta", asiento: 0, carta: "espadas-01" }, awards: [], signal: "labio-inferior" as never },
      { action: { tipo: "truco", asiento: 1 } as never, awards: [] },
      { action: { tipo: "carta", asiento: 1, carta: "oros-07" }, awards: [], signal: "cejas" as never },
      { action: { tipo: "paso-flor", asiento: 0 } as never, awards: [], signal: "ojos-cerrados" as never },
      // La seña propia no es una seña recibida.
      { action: { tipo: "carta", asiento: 2, carta: "copas-03" }, awards: [], signal: "beso" as never },
    ],
  });
  assert.equal(jugarEnSilencio(mesa, partida), true);
  const r = senasEnMesa({ mesa, partida, espectador: false });
  assert.deepEqual(r, {
    tipo: "silencio",
    recibidas: [
      { nombre: "Clara", sena: "Morder suavemente el labio de abajo", jugada: "As de espadas" },
      { nombre: "Clara", sena: "Cerrar los dos ojos", jugada: "Yo no canto" },
    ],
  });
});

test("una partida legada con otra versión de señas no es silencio", () => {
  const mesa: Mesa = { ...mesaDe("2v2", 2), formato: "pairs-private-senas" };
  assert.equal(jugarEnSilencio(mesa, partidaDe(vistaDe(4, 2), { versionSenas: "otra" })), false);
});

test("las mesas con señas de pie, sin señas o de tercetos no juegan en silencio", () => {
  assert.equal(jugarEnSilencio(mesaPie(2), partidaPie(vistaDelPie)), false);
  assert.equal(jugarEnSilencio(mesaDe("2v2", 2), partidaDe(vistaDe(4, 2))), false);
});

test("un espectador de una mesa legada tampoco ve señas", () => {
  const mesa: Mesa = { ...mesaDe("2v2", 2), formato: "pairs-private-senas" };
  assert.deepEqual(senasEnMesa({ mesa, partida: partidaDe(vistaDe(4, 2)), espectador: true }), { tipo: "ninguna" });
});

// #425: lo que dijo el pie queda junto a la mano del destinatario hasta que tira su carta.
const grupoPropio: VistaPie = { pie: 2, vuelta: 1, grupos: [{ emisor: 0, gestos: ["labios-derecha", "labios-izquierda"] }], opciones: [] };
const juga: IndicacionPie = { emisor: 2, destinatario: 0, frase: "juga", carta: "labios-derecha", vuelta: 1, indiceAccion: 0 };

test("el compañero ve la frase vigente del pie con la carta nombrada y sus cartas a resaltar", () => {
  const r = senasEnMesa({ mesa: mesaPie(0), partida: partidaPie(grupoPropio, { indicaciones: [juga] }), espectador: false });
  assert.equal(r.tipo, "companero");
  if (r.tipo === "companero") assert.deepEqual(r.pedido, { texto: "Ana: Jugá el as bravo", cartas: ["espadas-01"] });
  const sinCarta = { ...juga, carta: undefined };
  const s = senasEnMesa({ mesa: mesaPie(0), partida: partidaPie(grupoPropio, { indicaciones: [sinCarta] }), espectador: false });
  if (s.tipo === "companero") assert.deepEqual(s.pedido, { texto: "Ana: Jugá", cartas: [] });
});

test("la frase se retira al tirar o al cambiar de vuelta", () => {
  const tiro = partidaDe(vistaDe(4, 0, { muestra: "bastos-05", vueltaActual: { salida: 0, jugadas: [{ asiento: 0, carta: "copas-04" }] } }),
    { versionSenas: versionSenasPie, pie: grupoPropio, indicaciones: [juga] });
  const r = senasEnMesa({ mesa: mesaPie(0), partida: tiro, espectador: false });
  assert.equal(r.tipo === "companero" && r.pedido, undefined);
  const otraVuelta = partidaPie({ ...grupoPropio, vuelta: 2 }, { indicaciones: [juga] });
  const s = senasEnMesa({ mesa: mesaPie(0), partida: otraVuelta, espectador: false });
  assert.equal(s.tipo === "companero" && s.pedido, undefined);
});

test("en tercetos, quien recibe «Vení» también sabe a qué compañero va el equipo", () => {
  const pie: VistaPie = { pie: 4, vuelta: 1, grupos: [{ emisor: 0, gestos: ["boca"] }], opciones: [] };
  const indicaciones: IndicacionPie[] = [
    { emisor: 4, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 0 },
    { emisor: 4, destinatario: 2, frase: "juga", carta: "cejas", vuelta: 1, indiceAccion: 0 },
  ];
  const r = senasEnMesa({ mesa: mesaTercetos(0), partida: { ...partidaTercetos(pie), indicaciones }, espectador: false });
  assert.equal(r.tipo, "companero");
  if (r.tipo === "companero") assert.deepEqual(r.pedido, { texto: "Eli: Vení · juega Ana", cartas: [] });
});
