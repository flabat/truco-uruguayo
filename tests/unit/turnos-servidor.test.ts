import assert from "node:assert/strict";
import test from "node:test";
import { guardarAcciones, jugarComputadoras, leerAccion, restaurar, turnosDeEquipo, type Registro } from "../../api/turnos.ts";
import { continuarAlPie } from "../../api/partidas-pie.ts";
import { versionSenasPie, type IndicacionPie } from "../../src/motor/senas-pie.ts";
import { hasSignals, signalVersionFor, supportedFormats } from "../../training/contracts/index.ts";
import { iniciarOnline, marcadorOnline, type RepartoOnline } from "../../src/motor/mesa-online.ts";
import { dueloFlor } from "../fixtures/duelo-mazo.ts";

const parejas: RepartoOnline = {versionReparto: "online-1", mano: 0, dador: 3, muestra: "oros-01", manos: [
  ["bastos-02","bastos-03","bastos-04"], ["copas-05","copas-06","copas-07"],
  ["copas-02","espadas-01","oros-05"], ["espadas-02","espadas-04","bastos-05"],
]};
test("los clientes envían un gesto reconocido y una jugada, el servidor fija el asiento", () => {
  assert.deepEqual(leerAccion({tipo:"flor",sena:"nariz"}, 2, "pairs-senas"), {tipo:"flor", asiento:2, sena:"nariz"});
  for (const mal of [{tipo:"carta"}, {tipo:"oros-01"}, {tipo:"nariz/truco"}, {tipo:"carta", carta:"inventada"},
    {tipo:"flor",asiento:0}, {sena:"cejas"}, {tipo:"truco",sena:"invalida"}, {tipo:"truco",sena:null}]) {
    assert.throws(() => leerAccion(mal, 0, "pairs-senas"));
  }
  assert.throws(() => leerAccion({tipo:"truco",sena:"cejas"}, 0, "pairs"));
});
test("los comandos persistidos reconstruyen todas las señas y cobros sin volver a consultar al bot", () => {
  for (const formato of supportedFormats) {
    const reparto = formato === "duel" ? {...parejas, dador:1, manos:parejas.manos.slice(0,2)} as RepartoOnline : parejas;
    const estado = iniciarOnline(reparto);
    const inicial = {estado, turnos: []};
    const jugada = jugarComputadoras(inicial, formato, [], true);
    assert.ok(jugada.estado.resultado);
    assert.equal(jugada.turnos[0].action.tipo,"flor");
    assert.deepEqual(jugarComputadoras(inicial, formato, [0]), inicial);
    const fila: Registro = { numero:1, version:1, version_reglas:1,
      version_senas: signalVersionFor(formato),
      reparto, puntos_inicio:[0,0], acciones: guardarAcciones(jugada) };
    const repetida = restaurar(fila, formato);
    assert.deepEqual(repetida, jugada);
    if (hasSignals(formato)) {
      for (const asiento of [0, 1, 2, 3] as const) {
        const visibles = turnosDeEquipo(repetida.turnos, asiento);
        for (const [i, turno] of visibles.entries()) {
          const original = jugada.turnos[i];
          const esperado = original.action.asiento % 2 === asiento % 2 ? original : {action: original.action, awards: original.awards};
          assert.deepEqual(turno, esperado);
        }
      }
    }
    assert.throws(() => restaurar({...fila, version_senas:"futura"}, formato));
    assert.ok(fila.acciones.every(a => Boolean(a.sena) === hasSignals(formato)));
  }
});

test("al reanudar el duelo se registra sólo la decisión nueva con la propuesta original y los tantos confirmados", () => {
  const previa = restaurar(dueloFlor, "duel", 40, [0]);
  let decisiones = 0;
  const fin = jugarComputadoras(previa, "duel", [0], false, (paso, propuesta) => {
    decisiones++;
    assert.equal(propuesta, "copas-02");
    assert.deepEqual(paso.turnos.at(-1), {
      action: { tipo: "mazo", asiento: 1 }, awards: [{ equipo: 0, tantos: 1, motivo: "truco" }],
    });
    assert.deepEqual(marcadorOnline(paso.estado), [15, 0]);
  });
  assert.equal(decisiones, 1);
  jugarComputadoras(fin, "duel", [0], false, () => assert.fail("La mano ya terminó."));
});

test("las parejas con pie restauran las palabras aparte de las acciones y rechazan el gesto manual", () => {
  const indicaciones: IndicacionPie[] = [{ emisor: 2, destinatario: 0, vuelta: 1, frase: "veni", indiceAccion: 0 }];
  const fila: Registro = { numero: 1, version: 1, version_reglas: 1, version_senas: versionSenasPie,
    reparto: parejas, puntos_inicio: [0, 0], acciones: [], indicaciones };
  const mano = restaurar(fila, "pairs-private-senas");
  assert.deepEqual(mano.indicaciones, indicaciones);
  assert.deepEqual(mano.estado.acciones, []);
  assert.throws(() => restaurar(fila, "pairs-senas"), { status: 503 });
  const manual = { tipo: "flor", sena: "cejas" } as const;
  assert.throws(() => leerAccion(manual, 0, "pairs-private-senas", true), { status: 400 });
  assert.throws(() => restaurar({ ...fila, acciones: [{ ...manual, asiento: 0 }] }, "pairs-private-senas"), /manual/);
  assert.deepEqual(leerAccion(manual, 0, "pairs-private-senas"), { ...manual, asiento: 0 });
});

test("la ventana de una carta de bot depende del pie humano y conserva el mismo plazo con o sin palabra", async () => {
  const reparto: RepartoOnline = { ...parejas, reglaFlor: "inmediata-v2", manos: [
    ["bastos-06", "oros-03", "espadas-05"], ["copas-05", "bastos-07", "oros-06"],
    ["oros-12", "bastos-03", "espadas-07"], ["espadas-03", "copas-07", "bastos-04"],
  ] };
  const mano = { estado: iniciarOnline(reparto), turnos: [] };
  async function programacion(humanos: number[], anteriores: IndicacionPie[]) {
    const actividad: unknown[][] = [];
    const db = { async query(_sql: string, args: unknown[]) { actividad.push(args); } };
    await continuarAlPie(db as Parameters<typeof continuarAlPie>[0], "mesa", 1, mano, humanos, anteriores, mano.estado);
    return actividad;
  }
  const consejo: IndicacionPie = { emisor: 2, destinatario: 0, vuelta: 1, frase: "veni", indiceAccion: 0 };
  assert.deepEqual(await programacion([2], []), [["mesa", true]]);
  assert.deepEqual(await programacion([2], [consejo]), [["mesa", true]]);
  assert.deepEqual(await programacion([], []), [["mesa", false]]);
  assert.deepEqual(await programacion([0], []), [["mesa"]]);
});
