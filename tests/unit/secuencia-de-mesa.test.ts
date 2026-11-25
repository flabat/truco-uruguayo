import assert from "node:assert/strict";
import test from "node:test";
import type { Partida } from "@eltruco/cliente/cliente.ts";
import { pasosDeVueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import { entreCartas, vueltaCompleta } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { pausaDeVoz } from "@eltruco/cliente/voces.ts";

function partida(acciones: Partida["vista"]["acciones"], cambios: Partial<Partida["vista"]> = {}): Partida {
  const cartas = acciones.filter(a => a.tipo === "carta");
  const completa = cartas.length === 2;
  return {
    manoNumero: 1, version: acciones.length, meta: 30, puntos: [0, 0],
    lance: { activos: [0, 1] }, contexto: { versionVista: 1, fase: "en-juego" },
    vista: {
      asiento: 0, mano: 0, cartas: ["oros-01", "oros-02"].slice(cartas.filter(c => c.asiento === 0).length),
      acciones, cobros: [], vueltas: completa ? [{ salida: 0, jugadas: cartas, resultado: { tipo: "ganada", asiento: 0 } }] : [],
      vueltaActual: completa ? null : { salida: 0, jugadas: cartas }, resultado: null, ...cambios,
    },
  } as unknown as Partida;
}

test("cada carta rival espera entre cartas y el cierre de vuelta espera la vuelta completa", () => {
  const inicio = partida([]);
  const unaCarta = partida([{ tipo: "carta", asiento: 0, carta: "oros-01" }]);
  const cerrada = partida([{ tipo: "carta", asiento: 0, carta: "oros-01" }, { tipo: "carta", asiento: 1, carta: "copas-04" }]);
  assert.deepEqual(pasosDeVueltas(inicio, unaCarta, false).map(p => p.espera), [entreCartas]);
  const pasos = pasosDeVueltas(unaCarta, cerrada, false);
  assert.deepEqual(pasos.map(p => p.espera), [vueltaCompleta]);
  assert.ok(pasos[0].antesDelResultado, "la vuelta completa se ve antes del veredicto");
  assert.equal(pasos[0].antesDelResultado!.vista.vueltaActual?.jugadas.length, 2);
});

test("un canto rival se muestra como voz con su pausa y el propio no se repite", () => {
  const inicio = partida([]);
  const truco = partida([{ tipo: "truco", asiento: 1 }]);
  assert.deepEqual(pasosDeVueltas(inicio, truco, false).map(p => [p.voz?.texto, p.espera]), [["Truco", pausaDeVoz]]);
  const propio = partida([{ tipo: "truco", asiento: 0 }]);
  assert.deepEqual(pasosDeVueltas(inicio, propio, false), []);
});

test("sin estado previo de la mano no reproduce nada", () => {
  assert.deepEqual(pasosDeVueltas(undefined, partida([{ tipo: "truco", asiento: 1 }]), false), []);
});
