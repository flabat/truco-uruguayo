import assert from "node:assert/strict";
import test from "node:test";
import fixture from "../fixtures/pico-tercetos-v2.json" with { type: "json" };
import { aDecidir, aplicarOnline, historialPublico, iniciarOnline, marcadorOnline, vistaOnline, vistaTercetos, versionReglasTercetos,
  type AccionOnline, type EstadoOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import { esRepartoOnline, type Asiento } from "@eltruco/motor/reparto.ts";

const guardado: unknown = fixture.reparto;
assert.ok(esRepartoOnline(guardado));
const reparto: RepartoOnline = guardado;
const asientos = [0, 1, 2, 3, 4, 5] as const;

function confirmar(estado: EstadoOnline, accion: AccionOnline) {
  const paso = aplicarOnline(estado, accion);
  assert.ok(paso.ok, JSON.stringify({ accion, legales: vistaTercetos(estado, accion.asiento).legales }));
  return paso.estado;
}
function abrir(meta = fixture.meta, puntos: readonly [number, number] = [12, 11], r = reparto) {
  return iniciarOnline(r, puntos, meta, fixture.numero);
}

test("replay por asiento y por acción, con la misma muestra y todos los cobros hasta el primero decisivo", () => {
  assert.equal(fixture.versionReglas, versionReglasTercetos);
  let vivo = abrir();
  const confirmadas: AccionOnline[] = [];
  for (const accion of fixture.acciones) {
    assert.equal(accion.duelo, vivo.lance?.duelo);
    vivo = confirmar(vivo, accion as AccionOnline);
    confirmadas.push(accion as AccionOnline);
    const rearmado = JSON.parse(JSON.stringify(confirmadas)).reduce(confirmar, abrir());
    assert.deepEqual(aDecidir(vivo), aDecidir(rearmado));
    assert.deepEqual(marcadorOnline(vivo), marcadorOnline(rearmado));
    for (const asiento of asientos) {
      const vista = vistaTercetos(vivo, asiento);
      assert.deepEqual(vista, vistaTercetos(rearmado, asiento));
      if (vivo.resultado) {
        assert.deepEqual(vista.pruebasDeTantos, [
          { duelo: 1, asiento: 2, motivo: "envido", total: 37, cartas: ["oros-02", "bastos-07"] },
          { duelo: 2, asiento: 0, motivo: "flor", total: 38, cartas: reparto.manos[0] },
        ]);
        for (const futuro of [1, 4]) {
          for (const carta of reparto.manos[futuro]) assert.ok(!JSON.stringify(vista).includes(carta));
        }
      } else {
        assert.equal(vista.pruebasDeTantos, undefined);
      }
      assert.equal(vista.muestra, reparto.muestra);
      assert.equal(vista.dador, 4);
      assert.equal(vista.mano, 5);
      if (vista.estado !== "jugando") {
        assert.deepEqual(vista.legales, []);
        assert.equal("cartas" in vista || "tantosPropios" in vista, false);
        assert.throws(() => vistaOnline(vivo, asiento), RangeError);
      } else {
        assert.deepEqual(vista.cartas, reparto.manos[asiento]);
      }
    }
    if (confirmadas.length === 2) {
      assert.deepEqual(marcadorOnline(vivo), [14, 11]);
      assert.deepEqual(vivo.lance, { tipo: "pico-a-pico", duelo: 1, activos: [5, 2] });
    }
    if (confirmadas.length === 3) {
      assert.deepEqual(vivo.lance, { tipo: "pico-a-pico", duelo: 2, activos: [0, 3] });
      assert.deepEqual(vistaTercetos(vivo, 0).faltaPorEquipo, [11, 2]);
      assert.deepEqual(aplicarOnline(vivo, { tipo: "carta", asiento: 4, carta: reparto.manos[4][0] }),
        { ok: false, error: "fuera-de-turno" });
    }
  }
  assert.deepEqual(vivo.historialLances?.map(r => r.puntos), [[15, 11], [26, 11]]);
  assert.deepEqual(vivo.historialLances?.map(r => r.indiceCobroLateral), [1, 3]);
  assert.deepEqual(vivo.cobros, [{ equipo: 0, motivo: "flor", valor: 15, tantos: 11, asiento: 0, tantoGanador: 38 }]);
  assert.equal(vivo.resultado?.motivo, "flor");
  assert.equal(vivo.trucoPendiente, null);
  assert.deepEqual(aDecidir(vivo), []);
  assert.deepEqual(aplicarOnline(vivo, { tipo: "mazo", asiento: 1 }), { ok: false, error: "mano-cerrada" });
});

test("al entrar en buenas se completan ambos duelos restantes y el reparto siguiente es redondilla", () => {
  for (const meta of [26, 50]) {
    let estado = abrir(meta, [meta / 2 - 1, 1]);
    for (const accion of fixture.acciones.slice(0, 5)) estado = confirmar(estado, accion as AccionOnline);
    // Quiere la flor ordinaria y el mano concede el truco al rival.
    estado = confirmar(estado, { tipo: "quiero", asiento: 3 });
    estado = confirmar(estado, { tipo: "mazo", asiento: 0 });
    assert.deepEqual(estado.lance, { tipo: "pico-a-pico", duelo: 3, activos: [1, 4] });
    estado = confirmar(estado, { tipo: "mazo", asiento: 1 });
    estado = confirmar(estado, { tipo: "paso-flor", asiento: 4 });
    assert.equal(estado.historialLances?.length, 3);
    assert.deepEqual(marcadorOnline(estado), [meta / 2 + 6, 2]);
    const siguiente = iniciarOnline({ ...reparto, dador: 5, mano: 0 }, marcadorOnline(estado), meta, 3);
    assert.deepEqual(siguiente.lance, { tipo: "redondilla", duelo: null, activos: [...asientos] });
    assert.equal(iniciarOnline(reparto, marcadorOnline(estado), meta, 4).lance?.tipo, "redondilla");
  }
});

test("un resto al empezar el pico cierra el chico antes del segundo duelo", () => {
  const manos = [...reparto.manos];
  [manos[2], manos[0]] = [manos[0], manos[2]];
  [manos[5], manos[3]] = [manos[3], manos[5]];
  let estado = abrir(26, [12, 11], { ...reparto, manos });
  for (const [asiento, tipo] of [[5,"flor"], [2,"flor"], [2,"contraflor-al-resto"], [5,"quiero"]] as const) {
    estado = confirmar(estado, { asiento, tipo });
  }
  assert.deepEqual(marcadorOnline(estado), [26, 11]);
  assert.equal(estado.historialLances?.length, 1);
  assert.deepEqual(estado.cobros.map(c => [c.valor, c.tantos]), [[15, 14]]);
});

test("antes de su duelo la proyección tampoco cambia al reemplazar la terna que recibirá", () => {
  const manos = [...reparto.manos];
  [manos[0], manos[3]] = [manos[3], manos[0]];
  const visible = abrir();
  const alterna = abrir(26, [12, 11], { ...reparto, manos });
  for (const asiento of asientos) assert.deepEqual(vistaTercetos(visible, asiento), vistaTercetos(alterna, asiento));
  assert.deepEqual(aDecidir(visible), [5]);
});

test("cada mano física abre los tres pares enfrentados en orden", () => {
  for (const mano of asientos) {
    const r = { ...reparto, mano, dador: ((mano + 5) % 6) as Asiento };
    let estado = abrir(50, [0, 0], r);
    for (const duelo of [1, 2, 3]) {
      const primero = ((mano + duelo - 1) % 6) as Asiento;
      const opuesto = ((primero + 3) % 6) as Asiento;
      assert.deepEqual(estado.lance?.activos, [primero, opuesto]);
      while (!estado.resultado && estado.lance?.duelo === duelo) {
        const [asiento] = aDecidir(estado);
        const vista = vistaTercetos(estado, asiento);
        assert.equal(vista.estado, "jugando");
        const tipo = (["flor", "paso-flor", "quiero", "mazo"] as const).find(c => vista.legales.includes(c));
        assert.ok(tipo);
        estado = confirmar(estado, { tipo, asiento });
      }
    }
    assert.ok(estado.resultado);
  }
});

test("el duelo archivado conserva quién cantó su tanto en el envido querido", () => {
  let estado = abrir();
  for (const accion of fixture.acciones.slice(0, 3)) estado = confirmar(estado, accion as AccionOnline);
  assert.equal(estado.lance?.duelo, 2);
  const [primero] = historialPublico(estado.historialLances!);
  assert.deepEqual(primero.cobros[0], { equipo: 0, tantos: 2, valor: 2, motivo: "envido", asiento: 2, tantoGanador: 37,
    comparacionEnvido: { indiceAccion: 1, participantes: [{ asiento: 5, total: 4 }, { asiento: 2, total: 37 }] } });
  // Los cobros del árbitro conservan su formato: el replay los compara con lo registrado.
  assert.equal("comparacionEnvido" in estado.historialLances![0].cobros[0], false);
});
