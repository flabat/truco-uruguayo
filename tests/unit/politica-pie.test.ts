import assert from "node:assert/strict";
import test from "node:test";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionPoliticaPie, politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { aDecidir, aplicarOnline, iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { vistaDelPie } from "@eltruco/motor/senas-pie.ts";
import { artifactPin } from "../../api/actor-registry.ts";
import { abrirPoliticaPie, cargarPoliticaPie, decidirPie, esFormatoPie, esPin, politicaParaAnticipar } from "../../api/politica-pie.ts";
import { deal, rng } from "../../training/regularized/env.ts";
import { randomArtifact } from "../../training/regularized/network.ts";

const parejas = randomArtifact("pairs-private-senas", 11);
const tercetos = randomArtifact("triples", 12);

test("las claves al pie y los pines se reconocen", () => {
  assert.ok(esFormatoPie("pairs-pie") && esFormatoPie("triples-pie"));
  assert.ok(!esFormatoPie("pairs-private-senas") && !esFormatoPie("toString"));
  assert.ok(esPin(artifactPin(parejas)));
  assert.ok(!esPin(politicaPieParejas) && !esPin(undefined) && !esPin("A".repeat(64)));
  assert.equal(politicaParaAnticipar(artifactPin(parejas)), politicaPie);
  assert.equal(politicaParaAnticipar(politicaPieParejas), politicaPieParejas);
});

test("cada clave al pie exige el formato de su artefacto", () => {
  assert.equal(typeof abrirPoliticaPie(parejas, "pairs-pie"), "function");
  assert.equal(typeof abrirPoliticaPie(tercetos, "triples-pie"), "function");
  assert.throws(() => abrirPoliticaPie(parejas, "triples-pie"), /no corresponde/);
  assert.throws(() => abrirPoliticaPie(randomArtifact("duel"), "pairs-pie"), /no corresponde/);
  assert.throws(() => abrirPoliticaPie(null, "pairs-pie"), /no corresponde/);
});

test("el actor aprendido juega manos completas al pie en parejas y tercetos", () => {
  for (const [artifact, mode, target] of [[parejas, "pie", 40], [tercetos, "tercetos", 50]] as const) {
    const decide = abrirPoliticaPie(artifact, mode === "pie" ? "pairs-pie" : "triples-pie");
    const pin = artifactPin(artifact);
    const azar = rng(3);
    for (let mano = 0; mano < 5; mano++) {
      let estado = iniciarOnline(deal(mode, rng(20 + mano), mano % 2), [12, 7], target, 1);
      for (let paso = 0; !estado.resultado; paso++) {
        assert.ok(paso < 200, "la mano no termina");
        const asiento = aDecidir(estado)[0];
        const vista = vistaOnline(estado, asiento);
        const accion = decidirPie(pin, decide, estado, vista, vistaDelPie(estado, asiento, []), [], azar);
        assert.ok(accion && (vista.legales as string[]).includes(accion.tipo), mode);
        assert.equal(accion.asiento, asiento);
        const r = aplicarOnline(estado, accion);
        assert.ok(r.ok, mode + " " + JSON.stringify(accion));
        estado = r.estado;
      }
    }
  }
});

test("sin pin decide la política fija y un pin sin actor abierto falla", () => {
  const estado = iniciarOnline(deal("pie", rng(5), 0), [0, 0], 40, 1);
  const asiento = aDecidir(estado)[0];
  const vista = vistaOnline(estado, asiento), pie = vistaDelPie(estado, asiento, []);
  assert.deepEqual(decidirPie(politicaPieParejas, undefined, estado, vista, pie, []),
    elegirAccionPoliticaPie(politicaPieParejas, vista, pie, []));
  assert.throws(() => decidirPie(artifactPin(parejas), undefined, estado, vista, pie, []), /Falta abrir/);
});

test("el actor al pie se carga una vez del registro y solo con una clave al pie", async () => {
  const filas: Record<string, { formato: string; contenido: unknown }> = {
    [artifactPin(parejas)]: { formato: "pairs-pie", contenido: parejas },
    [artifactPin(tercetos)]: { formato: "pairs-private-senas", contenido: tercetos },
  };
  let consultas = 0;
  const db = { async query(_sql: string, [pin]: string[]) { consultas++; return { rows: filas[pin] ? [filas[pin]] : [] }; } };
  const primera = await cargarPoliticaPie(db as never, artifactPin(parejas));
  assert.equal(await cargarPoliticaPie(db as never, artifactPin(parejas)), primera);
  assert.equal(consultas, 1);
  await assert.rejects(cargarPoliticaPie(db as never, artifactPin(tercetos)), /actor al pie/);
  await assert.rejects(cargarPoliticaPie(db as never, "0".repeat(64)), /actor al pie/);
});
