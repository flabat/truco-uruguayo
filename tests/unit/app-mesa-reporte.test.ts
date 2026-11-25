import assert from "node:assert/strict";
import test from "node:test";
import type { PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { camposDelReporte, enlaceDeReporte } from "../../app/src/mesa/reporte-campos.ts";
import { partidaDe, vistaDe } from "./fixtures/app-mesa.ts";

const acciones = [
  { tipo: "envido", asiento: 0 },
  { tipo: "quiero", asiento: 1 },
  { tipo: "carta", asiento: 0, carta: "espadas-01" },
] as const;

test("duelo: los mismos campos ocultos que el formulario de ReporteDeJugada", () => {
  const partida = partidaDe(vistaDe(2, 0, { acciones }), { manoNumero: 4, puntos: [7, 3] });
  assert.deepEqual(camposDelReporte(partida, 2, false), {
    mano: "4", posicion: "3", vuelta: "2", puntos: "7-3", fase: "jugada",
  });
  const cerrada = partidaDe(vistaDe(2, 0, { acciones, resultado: { tipo: "vueltas", equipo: 0 } as never }));
  assert.equal(camposDelReporte(cerrada, 3, false).fase, "resultado");
  assert.equal(camposDelReporte(cerrada, 3, true).fase, "presentacion");
  assert.deepEqual(camposDelReporte(partida, 1, false, 0), {
    mano: "4", posicion: "3", vuelta: "1", puntos: "7-3", fase: "presentacion", voz: "0",
  });
});

test("con señas al pie se suma cuántas indicaciones se vieron", () => {
  const indicacion = { emisor: 0, destinatario: 2, frase: "veni", vuelta: 1, indiceAccion: 0 } as const;
  const partida = partidaDe(vistaDe(4, 0), { versionSenas: versionSenasPie, indicaciones: [indicacion] });
  assert.equal(camposDelReporte(partida, 1, false).indicaciones, "1");
  const sinIndicaciones = partidaDe(vistaDe(4, 0), { versionSenas: versionSenasPie });
  assert.equal(camposDelReporte(sinIndicaciones, 1, false).indicaciones, "0");
  assert.equal("indicaciones" in camposDelReporte(partidaDe(vistaDe(4, 0)), 1, false), false);
});

test("tercetos: la posición suma las acciones de los otros duelos y manda el duelo", () => {
  const partida = {
    ...partidaDe(vistaDe(4, 0, { acciones })),
    formato: "triples",
    lance: { tipo: "pico-a-pico", duelo: 2, activos: [0, 1] },
    historialLances: [
      { tipo: "pico-a-pico", duelo: 1, acciones: [acciones[2], acciones[2]] },
      { tipo: "pico-a-pico", duelo: 2, acciones },
    ],
  } as unknown as PartidaTercetos;
  assert.deepEqual(camposDelReporte(partida, 1, false), {
    mano: "1", posicion: "5", vuelta: "1", puntos: "0-0", fase: "jugada", duelo: "2",
  });
});

test("la app solo abre el enlace del reporte si es de GitHub y la respuesta no se redirigió", () => {
  const enlace = "https://github.com/flabat/truco-uruguayo/issues/new?title=x";
  assert.equal(enlaceDeReporte({ enlace }, false), enlace);
  assert.equal(enlaceDeReporte({ enlace }, true), null);
  assert.equal(enlaceDeReporte({ enlace: "https://github.com.ejemplo.com/x" }, false), null);
  assert.equal(enlaceDeReporte({ enlace: "https://ejemplo.com/" }, false), null);
  assert.equal(enlaceDeReporte({ enlace: "http://github.com/x" }, false), null);
  assert.equal(enlaceDeReporte({}, false), null);
  assert.equal(enlaceDeReporte(null, false), null);
});
