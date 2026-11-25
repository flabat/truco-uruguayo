import assert from "node:assert/strict";
import test from "node:test";
import { respuestaConFlor } from "@eltruco/cliente/cantos.ts";
import { avisoDeCanto, hojaDeCantos, transicionDeHoja, verboDeCanto, type EntradaHoja } from "../../app/src/mesa/hoja-cantos.ts";

const base: EntradaHoja = {
  legales: [],
  pendiente: null,
  trucoPendiente: null,
  porDeclararFlor: null,
  miAsiento: 0,
  nombre: asiento => ["Vos", "Diego", "Ana", "Beto"][asiento],
};

test("verboDeCanto agrupa los cantos por verbo", () => {
  for (const t of ["truco", "retruco", "vale-cuatro"] as const) assert.equal(verboDeCanto(t), "gritó");
  for (const t of ["envido", "real-envido", "falta-envido"] as const) assert.equal(verboDeCanto(t), "tocó");
  for (const t of ["flor", "con-flor-envido", "contraflor-al-resto"] as const) assert.equal(verboDeCanto(t), "cantó");
  for (const t of ["quiero", "no-quiero", "con-flor-quiero", "paso-flor", "mazo"] as const) assert.equal(verboDeCanto(t), "dijo");
});

test("avisoDeCanto arma la frase con el verbo y el canto en minúscula", () => {
  assert.equal(avisoDeCanto("Diego", "envido"), "Diego tocó envido");
  assert.equal(avisoDeCanto("Diego", "truco"), "Diego gritó truco");
  assert.equal(avisoDeCanto("Diego", "flor"), "Diego cantó flor");
  assert.equal(avisoDeCanto("Diego", "quiero"), "Diego dijo quiero");
});

test("sin cantos legales no hay hoja", () => {
  assert.equal(hojaDeCantos(base), null);
  assert.equal(hojaDeCantos({ ...base, legales: ["carta"] }), null);
});

test("si responde el compañero no hay hoja", () => {
  assert.equal(hojaDeCantos({ ...base, legales: ["carta"], pendiente: { asiento: 1, tipo: "envido" } }), null);
});

test("en turno propio ofrece los cantos legales agrupados", () => {
  const h = hojaDeCantos({ ...base, legales: ["carta", "envido", "truco", "mazo"], tantosPropios: { total: 33, modalidad: "envido" } });
  assert.deepEqual(h, {
    modo: "propia",
    cerrable: true,
    encabezado: "Cantos",
    detalle: "Tenés 33 de envido",
    respuestas: [],
    grupos: [{ nombre: "Envido", opciones: ["envido"] }, { nombre: "Truco", opciones: ["truco"] }],
    mazo: true,
    notas: [],
  });
});

test("sin tantos propios no hay detalle", () => {
  assert.equal(hojaDeCantos({ ...base, legales: ["truco"] })?.detalle, null);
});

test("cuando te tocan envido pide respuesta y ofrece las subidas", () => {
  const h = hojaDeCantos({
    ...base,
    legales: ["quiero", "no-quiero", "real-envido", "falta-envido"],
    pendiente: { asiento: 1, tipo: "envido" },
    tantosPropios: { total: 33, modalidad: "envido" },
  });
  assert.equal(h?.modo, "respuesta");
  assert.equal(h?.cerrable, false);
  assert.equal(h?.encabezado, "Diego tocó envido");
  assert.equal(h?.detalle, null);
  assert.deepEqual(h?.respuestas, ["quiero", "no-quiero"]);
  assert.deepEqual(h?.grupos, [{ nombre: "Envido", opciones: ["real-envido", "falta-envido"] }]);
  assert.equal(h?.mazo, false);
});

test("avisa el truco que queda pendiente bajo un envido", () => {
  const h = hojaDeCantos({
    ...base,
    legales: ["quiero", "no-quiero"],
    pendiente: { asiento: 1, tipo: "envido" },
    trucoPendiente: { asiento: 1, tipo: "truco" },
  });
  assert.ok(h?.notas.includes("Queda pendiente el truco de Diego."));
});

test("no avisa pendiente cuando el truco es el propio lance pendiente", () => {
  const h = hojaDeCantos({
    ...base,
    legales: ["quiero", "no-quiero", "retruco"],
    pendiente: { asiento: 1, tipo: "truco" },
    trucoPendiente: { asiento: 1, tipo: "truco" },
  });
  assert.deepEqual(h?.notas, []);
  assert.deepEqual(h?.grupos, [{ nombre: "Truco", opciones: ["retruco"] }]);
});

test("cuando te toca declarar la flor explica con flor quiero", () => {
  const h = hojaDeCantos({
    ...base,
    legales: ["flor", "con-flor-quiero", "paso-flor"],
    pendiente: { asiento: 1, tipo: "envido" },
    porDeclararFlor: 0,
  });
  assert.equal(h?.modo, "flor");
  assert.equal(h?.cerrable, false);
  assert.equal(h?.encabezado, "Te toca declarar");
  assert.deepEqual(h?.respuestas, ["flor", "con-flor-quiero", "paso-flor"]);
  assert.ok(h?.notas.includes(respuestaConFlor));
});

test("la falta envido en tercetos muestra cuánto cobra cada equipo", () => {
  const nota = "Falta envido · Si gana tu equipo, cobra 12 tantos. Si ganan los rivales, cobran 18 tantos.";
  const legal = hojaDeCantos({ ...base, legales: ["falta-envido"], falta: { propio: 12, rival: 18 } });
  assert.ok(legal?.notas.includes(nota));
  const pendiente = hojaDeCantos({
    ...base,
    legales: ["quiero", "no-quiero"],
    pendiente: { asiento: 1, tipo: "falta-envido" },
    falta: { propio: 12, rival: 18 },
  });
  assert.ok(pendiente?.notas.includes(nota));
  assert.ok(!hojaDeCantos({ ...base, legales: ["falta-envido"] })?.notas.some(n => n.startsWith("Falta envido")));
});

test("la hoja sube sola y avisa una vez al entrar en respuesta o flor", () => {
  const propia = hojaDeCantos({ ...base, legales: ["envido"] });
  const respuesta = hojaDeCantos({ ...base, legales: ["quiero", "no-quiero"], pendiente: { asiento: 1, tipo: "envido" } });
  const flor = hojaDeCantos({ ...base, legales: ["flor", "paso-flor"], porDeclararFlor: 0 });
  assert.deepEqual(transicionDeHoja(null, respuesta, false), { abierta: true, avisar: true });
  assert.deepEqual(transicionDeHoja(propia, respuesta, false), { abierta: true, avisar: true });
  assert.deepEqual(transicionDeHoja(respuesta, flor, true), { abierta: true, avisar: true });
  assert.deepEqual(transicionDeHoja(respuesta, respuesta, true), { abierta: true, avisar: false });
  assert.deepEqual(transicionDeHoja(respuesta, null, true), { abierta: false, avisar: false });
  assert.deepEqual(transicionDeHoja(null, null, false), { abierta: false, avisar: false });
  assert.deepEqual(transicionDeHoja(propia, propia, true), { abierta: true, avisar: false });
  assert.deepEqual(transicionDeHoja(propia, propia, false), { abierta: false, avisar: false });
});

test("al responder, la hoja forzada se cierra aunque siga tu turno", () => {
  const propia = hojaDeCantos({ ...base, legales: ["truco"] });
  const respuesta = hojaDeCantos({ ...base, legales: ["quiero", "no-quiero"], pendiente: { asiento: 1, tipo: "envido" } });
  const flor = hojaDeCantos({ ...base, legales: ["flor", "paso-flor"], porDeclararFlor: 0 });
  assert.deepEqual(transicionDeHoja(respuesta, propia, true), { abierta: false, avisar: false });
  assert.deepEqual(transicionDeHoja(flor, propia, true), { abierta: false, avisar: false });
});

test("si te toca declarar pero no hay respuestas de flor legales, queda la hoja propia con el mazo", () => {
  const h = hojaDeCantos({ ...base, legales: ["mazo"], porDeclararFlor: 0, pendiente: { asiento: 1, tipo: "envido" } });
  assert.equal(h?.modo, "propia");
  assert.equal(h?.mazo, true);
  assert.deepEqual(h?.respuestas, []);
});
