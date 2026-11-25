import assert from "node:assert/strict";
import test from "node:test";
import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { versionSenasPie, type VistaPie } from "@eltruco/motor/senas-pie.ts";
import { jugarEnSilencio, senasEnMesa } from "../../app/src/mesa/senas.ts";
import { mesaDe, partidaDe, vistaDe } from "./fixtures/app-mesa.ts";

// Asientos 0 y 2 son un equipo; el pie es el 2 (Ana) y sus compañeros son 0 (Clara) y 4.
function mesaPie(miAsiento: number): Mesa {
  return { ...mesaDe("2v2", miAsiento), versionSenas: versionSenasPie };
}
function partidaPie(pie: VistaPie | undefined, cambios: Partial<Partida> = {}): Partida {
  return partidaDe(vistaDe(4, 0, { muestra: "bastos-05" }), { versionSenas: versionSenasPie, pie, ...cambios });
}
const vistaDelPie: VistaPie = {
  pie: 2, vuelta: 1, esperando: 0,
  grupos: [
    { emisor: 0, gestos: ["labio-inferior", "cejas"] },
    { emisor: 1, gestos: ["lengua"] },
  ],
  opciones: [{ destinatario: 0, frases: ["juga"] }, { destinatario: 1, frases: ["voy-a-vos"] }],
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
  const r = senasEnMesa({ mesa: mesaPie(2), partida: partidaPie(vistaDelPie), espectador: false });
  assert.deepEqual(r, {
    tipo: "pie", vuelta: 1,
    globos: [
      { emisor: 0, nombre: "Clara", gestos: [
        { gesto: "labio-inferior", significado: "Tres" },
        { gesto: "cejas", significado: "2 de bastos" },
      ] },
      { emisor: 1, nombre: "Diego", gestos: [{ gesto: "lengua", significado: "As de copa u oro" }] },
    ],
    frases: [
      { destinatario: 0, nombre: "Clara", frases: ["juga"], esperando: true },
      { destinatario: 1, nombre: "Diego", frases: ["voy-a-vos"], esperando: false },
    ],
  });
});

test("el pie sin opciones ve los globos y ninguna frase", () => {
  const pie: VistaPie = { pie: 2, vuelta: 2, grupos: vistaDelPie.grupos, opciones: [] };
  const r = senasEnMesa({ mesa: mesaPie(2), partida: partidaPie(pie), espectador: false });
  assert.equal(r.tipo, "pie");
  if (r.tipo === "pie") {
    assert.equal(r.globos.length, 2);
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

test("la mesa legada con seña elegida a mano juega en silencio y lista las señas recibidas", () => {
  const mesa: Mesa = { ...mesaDe("2v2", 2), formato: "pairs-private-senas" };
  const vista = vistaDe(4, 2);
  const partida = partidaDe(vista, {
    formato: "pairs-private-senas",
    turnos: [
      { action: { tipo: "carta", asiento: 0, carta: "espadas-01" }, awards: [], signal: "labio-inferior" as never },
      { action: { tipo: "truco", asiento: 1 } as never, awards: [] },
      { action: { tipo: "paso-flor", asiento: 0 } as never, awards: [], signal: "ojos-cerrados" as never },
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

test("las mesas con señas de pie, sin señas o de tercetos no juegan en silencio", () => {
  assert.equal(jugarEnSilencio(mesaPie(2), partidaPie(vistaDelPie)), false);
  assert.equal(jugarEnSilencio(mesaDe("2v2", 2), partidaDe(vistaDe(4, 2))), false);
});

test("un espectador de una mesa legada tampoco ve señas", () => {
  const mesa: Mesa = { ...mesaDe("2v2", 2), formato: "pairs-private-senas" };
  assert.deepEqual(senasEnMesa({ mesa, partida: partidaDe(vistaDe(4, 2)), espectador: true }), { tipo: "ninguna" });
});
