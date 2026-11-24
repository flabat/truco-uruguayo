import assert from "node:assert/strict";
import test from "node:test";
import { parsearSilencios, textoDeSrt, verificarSalida } from "../scripts/controles.ts";
import { armarLinea, type LineaGuion, type Palabra } from "../src/lib/linea.ts";
import fixture from "./fixtures/envido-03.json" with { type: "json" };

const lineas = fixture.lineas as LineaGuion[];
const linea = armarLinea(lineas, fixture.palabras as Palabra[]);
const srtBueno = lineas.map((l, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i},900\n${l.texto}`).join("\n\n") + "\n";
const cubiertas = linea.pausas.map((p) => ({ inicio: p.desde - 0.2, fin: p.hasta + 0.05 }));
const buena = { duracion: linea.duracion, audios: [{ codec: "aac", frecuencia: 48000 }], silencios: cubiertas };

test("parsearSilencios lee inicio y fin", () => {
  const stderr = `[silencedetect @ 0x7ae4ca4840] silence_start: 8.321104
[silencedetect @ 0x7ae4ca4840] silence_end: 11.718458 | silence_duration: 3.397354
[silencedetect @ 0x7ae4ca4840] silence_start: 22.126
[silencedetect @ 0x7ae4ca4840] silence_end: 25.437625 | silence_duration: 3.311625
`;
  assert.deepEqual(parsearSilencios(stderr), [{ inicio: 8.321104, fin: 11.718458 }, { inicio: 22.126, fin: 25.437625 }]);
});

test("parsearSilencios cierra un silencio que llega al final del archivo", () => {
  assert.deepEqual(parsearSilencios("[silencedetect @ 0x1] silence_start: 40.5\n", 42), [{ inicio: 40.5, fin: 42 }]);
});

test("textoDeSrt une las líneas sin números ni tiempos", () => {
  assert.equal(textoDeSrt("1\n00:00:00,000 --> 00:00:01,000\nHola che.\n\n2\n00:00:01,000 --> 00:00:02,000\nProbá\notra.\n"), "Hola che. Probá otra.");
});

test("una salida correcta no tiene problemas", () => {
  assert.deepEqual(verificarSalida(buena, { linea, lineas, srt: srtBueno }), []);
});

test("verificarSalida informa una pausa faltante", () => {
  const problemas = verificarSalida({ ...buena, silencios: cubiertas.slice(0, 1) }, { linea, lineas, srt: srtBueno });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /cambio/);
});

test("verificarSalida informa duración, audio y subtítulos", () => {
  const problemas = verificarSalida({ duracion: linea.duracion + 1, audios: [], silencios: cubiertas },
    { linea, lineas, srt: srtBueno.replace("Treinta y dos", "Treinta y tres") });
  assert.equal(problemas.length, 3, problemas.join("\n"));
});
