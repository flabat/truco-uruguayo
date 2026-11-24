import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { capturarReplay, reproducirReplay } from "@eltruco/motor/replay.ts";
import vector from "../fixtures/replay-v1.json" with { type: "json" };

function terminal(args: string[], input?: string) {
  return spawnSync(process.execPath, ["scripts/simular-mano.ts", ...args], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8", input, timeout: 10_000,
  });
}

function salida(args: string[], input?: string): string {
  const resultado = terminal(args, input);
  assert.equal(resultado.status, 0, resultado.error?.message ?? resultado.stderr);
  assert.equal(resultado.stderr, "");
  return resultado.stdout;
}

test("el comando guarda una mano completa, cuenta el envido del aprendiz y reproduce el mismo relato", (t) => {
  const directorio = mkdtempSync(join(tmpdir(), "truco-simulacion-"));
  t.after(() => rmSync(directorio, { recursive: true, force: true }));
  const archivo = join(directorio, "mano.json");
  const relato = salida(["--semilla", "217", "--dador", "3", "--guardar", archivo]);
  assert.match(relato, /Muestra · sota de bastos/);
  assert.match(relato, /Cartas del aprendiz · rey de bastos, 6 de espadas, caballo de copas/);
  assert.match(relato, /33 de envido/);
  assert.match(relato, /Vuelta 2\n[\s\S]*Parda\.\n\nLa pareja 1 y 3 gana la mano\./);

  const json = readFileSync(archivo, "utf8");
  assert.equal(salida(["--replay", archivo]), relato);
  assert.equal(salida(["--replay", "-"], json), relato);
  assert.equal(salida(["--guardar", "-"]), json);

  const restaurada = reproducirReplay(json);
  assert.ok(restaurada.ok);
  const { estado } = restaurada;
  assert.equal(estado.turno, null);
  assert.equal(estado.vueltaActual, null);
  assert.equal(estado.equipoGanador, 1);
  assert.deepEqual(estado.restantes, [["copas-11"], ["espadas-11"], ["bastos-07"], ["bastos-06"]]);
  assert.deepEqual(estado.vueltas.map(({ salida, resultado }) => [salida, resultado]), [
    [0, { tipo: "ganada", equipo: 1, asiento: 3 }], [3, { tipo: "parda" }],
  ]);
  assert.deepEqual(capturarReplay(estado), JSON.parse(json));
});

test("otros repartos distinguen la flor del aprendiz y el cierre en tres vueltas", () => {
  const flor = salida(["--semilla", "0", "--dador", "3"]);
  assert.match(flor, /Muestra · 7 de copas/);
  assert.match(flor, /32 de flor/);
  const tres = salida(["--semilla", "1", "--dador", "3"]);
  assert.match(tres, /Muestra · as de oros/);
  assert.match(tres, /Vuelta 3\n/);
});

test("con cada dador, las semillas de prueba producen vueltas legales de cuatro asientos hasta el cierre", () => {
  for (const dador of [0, 1, 2, 3]) {
    for (const semilla of [0, 1, 217, 4294967295]) {
      const json = salida(["--semilla", String(semilla), "--dador", String(dador), "--guardar", "-"]);
      const replay = reproducirReplay(json);
      assert.ok(replay.ok, json);
      const { reparto, vueltas, equipoGanador, turno } = replay.estado;
      assert.equal(reparto.dador, dador);
      assert.equal(reparto.semilla, semilla);
      assert.equal(turno, null);
      assert.ok(equipoGanador === 0 || equipoGanador === 1);
      assert.ok(vueltas.length === 2 || vueltas.length === 3);
      for (const { jugadas } of vueltas) {
        assert.deepEqual(jugadas.map(({ asiento }) => asiento).sort(), [0, 1, 2, 3]);
      }
    }
  }
});

test("un prefijo conserva hasta la última carta registrada aunque el bot de la demo elija otra", () => {
  const json = JSON.stringify({ ...vector, jugadas: vector.jugadas.slice(0, 2) });
  const parcial = salida(["--replay", "-"], json);
  assert.match(parcial, /Vuelta 1 en curso/);
  assert.match(parcial, /Asiento 1 \(rival\) juega caballo de espadas\.\nSigue el asiento 2\.\n$/);
  assert.doesNotMatch(parcial, /gana la mano/);
  const inicial = salida(["--replay", "-"], JSON.stringify({ ...vector, jugadas: [] }));
  assert.match(inicial, /Vuelta 1 en curso\nSigue el asiento 0\.\n$/);
});

test("una entrada inválida termina con error por stderr", () => {
  for (const [args, input, motivo] of [
    [["--semilla", "4294967296"], "", /semilla/],
    [["--dador", "4"], "", /dador/],
    [["--semilla", ""], "", /entero/],
    [["--replay", "-", "--dador", "0"], "", /Usá --replay solo/],
    [["--replay", "-"], "{", /json-invalido/],
    [["--replay", "-"], JSON.stringify({ ...vector, jugadas: [vector.jugadas[1]] }), /Jugada 1.*fuera-de-turno/],
  ] as const) {
    const resultado = terminal([...args], input);
    assert.equal(resultado.status, 1);
    assert.equal(resultado.stdout, "");
    assert.match(resultado.stderr, motivo);
  }
});
