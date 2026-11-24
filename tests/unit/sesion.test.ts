import assert from "node:assert/strict";
import test from "node:test";
import { crearFuenteProgreso, progresoDe } from "../../src/aprendizaje/progreso.ts";
import { generarSesion, iniciarSesion } from "../../src/aprendizaje/sesion.ts";
import type { Leccion, ProveedorSituaciones, Respuesta, SituacionVisible } from "../../src/aprendizaje/tipos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";

const envido: Leccion = {
  id: "envido-con-pieza", habilidad: "contar-envido", titulo: "Contar el envido",
  capitulo: "envido", familias: ["una-pieza"],
  pasos: [
    { tipo: "elegir-cartas", id: "seleccion", minimo: 2, maximo: 2,
      consigna: "Elegí las dos cartas que cuentan.", pista: "Buscá la pieza y el mejor tanto restante." },
    { tipo: "responder-total", id: "cuenta", consigna: "¿Cuánto suman?", pista: "Sumá los dos aportes." },
  ],
};

const seleccion: Respuesta = { tipo: "elegir-cartas", cartas: ["copas-07", "bastos-04"] };
const total: Respuesta = { tipo: "responder-total", total: 36 };
const totalErrado: Respuesta = { tipo: "responder-total", total: 11 };
const ayuda = "El cuatro del palo de la muestra aporta 29 al envido.";

// Oráculo de la mano de ejemplo del diseño. Solo varía la tercera carta, que no cuenta.
const proveedor: ProveedorSituaciones = {
  generar({ habilidad, familia, semilla, recientes }) {
    const opciones: CardId[] = ["espadas-01", "espadas-02"];
    const indice = semilla % opciones.length;
    const tercera = recientes[0] === opciones[indice] ? opciones[1 - indice] : opciones[indice];
    return { habilidad, familia, semilla, id: `envido-${semilla}`, clave: tercera, muestra: "bastos-06",
      cartas: ["bastos-04", "copas-07", tercera], explicacion: "29 + 7 = 36" };
  },
  evaluar(situacion, paso, respuesta) {
    if (paso.id === "seleccion" && respuesta.tipo === "elegir-cartas") {
      const correcta = respuesta.cartas.includes("bastos-04") && respuesta.cartas.includes("copas-07");
      return { correcta, explicacion: correcta ? "Elegiste la pieza y el siete." : "Revisá las cartas elegidas." };
    }
    assert.equal(respuesta.tipo, "responder-total");
    const correcta = respuesta.total === 36;
    return { correcta, explicacion: correcta ? situacion.explicacion : "Revisá el valor de la pieza.", pista: ayuda };
  },
};

test("una lección con varios pasos acredita una sola situación al completarse", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const sesion = generarSesion(envido, 0, proveedor, fuente);
  assert.equal(sesion.pasoActual?.id, "seleccion");
  assert.throws(() => sesion.responder(total), /no corresponde/);
  assert.throws(() => sesion.responder({ tipo: "elegir-cartas", cartas: ["copas-07"] }), /no corresponde/);
  assert.throws(() => sesion.responder({ tipo: "elegir-cartas", cartas: ["copas-07", "copas-07"] }), /no corresponde/);
  assert.throws(() => sesion.responder({ tipo: "elegir-cartas", cartas: ["copas-07", "oros-01"] }), /no corresponde/);
  assert.equal(sesion.intentos.length, 0);
  assert.equal(sesion.responder(seleccion).correcta, true);
  assert.equal(sesion.pasoActual?.id, "cuenta");
  assert.equal(progresoDe(fuente.actual, envido.habilidad).casos[0].acreditado, false);
  assert.throws(() => sesion.responder({ tipo: "responder-total", total: NaN }), /no corresponde/);
  assert.deepEqual(sesion.responder(total), {
    habilidad: "contar-envido", familia: "una-pieza", situacion: "envido-0",
    paso: "cuenta", respuesta: total, correcta: true, explicacion: "29 + 7 = 36", conPista: false,
  });
  assert.equal(sesion.completada, true);
  assert.equal(sesion.pasoActual, undefined);
  assert.deepEqual(progresoDe(fuente.actual, envido.habilidad).casos, [
    { clave: sesion.situacion.clave, familia: "una-pieza", acreditado: true },
  ]);
  assert.throws(() => sesion.responder(total), /resuelta/);
  assert.throws(() => sesion.pedirPista(), /resuelta/);
});

test("consultar la regla entre pasos descarta solo el acierto independiente de esa mano", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const asistida = generarSesion(envido, 0, proveedor, fuente);
  const intento = asistida.responder(seleccion);
  asistida.consultarRegla();
  assert.equal(asistida.pasoActual?.id, "cuenta");
  assert.equal(asistida.pista, undefined);
  assert.deepEqual(asistida.intentos, [intento]);
  assert.equal(asistida.responder(total).correcta, true);

  const siguiente = generarSesion(envido, 1, proveedor, fuente);
  siguiente.responder(seleccion);
  siguiente.responder(total);
  siguiente.consultarRegla();
  assert.deepEqual(progresoDe(fuente.actual, envido.habilidad).casos, [
    { clave: asistida.situacion.clave, familia: "una-pieza", acreditado: false },
    { clave: siguiente.situacion.clave, familia: "una-pieza", acreditado: true },
  ]);
});

test("dos errores recientes en la habilidad activan la pista específica en la misma mano y paso", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const primera = generarSesion(envido, 0, proveedor, fuente);
  primera.responder(seleccion);
  primera.responder(totalErrado);
  assert.equal(primera.pista, undefined);
  primera.responder(total);
  const segunda = generarSesion(envido, 2, proveedor, fuente);
  assert.notEqual(segunda.situacion.clave, primera.situacion.clave);
  const mano = segunda.situacion;
  segunda.responder(seleccion);
  segunda.responder(totalErrado);
  assert.equal(segunda.pista, ayuda);
  assert.equal(segunda.situacion, mano);
  assert.equal(segunda.pasoActual?.id, "cuenta");
  assert.equal(segunda.responder(total).conPista, true);
  assert.equal(segunda.completada, true);
  assert.ok(progresoDe(fuente.actual, envido.habilidad).casos.every((caso) => !caso.acreditado));
  const siguiente = generarSesion(envido, 4, proveedor, fuente);
  assert.notEqual(siguiente.situacion.clave, mano.clave);
  assert.equal(siguiente.pasoActual?.id, "seleccion");
  assert.equal(siguiente.pista, undefined);
});

test("dos errores en el mismo paso también ofrecen pista y conservan la selección pendiente", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const sesion = generarSesion(envido, 5, proveedor, fuente);
  const incorrecta: Respuesta = { tipo: "elegir-cartas", cartas: ["copas-07", sesion.situacion.cartas[2]] };
  for (let i = 0; i < 2; i++) {
    assert.equal(sesion.responder(incorrecta).correcta, false);
    assert.equal(sesion.pasoActual?.tipo, "elegir-cartas");
  }
  assert.equal(sesion.pista, envido.pasos[0].pista);
  assert.equal(sesion.responder(seleccion).conPista, true);
  assert.equal(sesion.pista, undefined);
  sesion.responder(total);
  assert.equal(fuente.actual.habilidades[0].casos[0].acreditado, false);
});

test("pedir ayuda y reabrir una mano con otra semilla y cartas reordenadas no acredita evidencia", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const primera = generarSesion(envido, 0, proveedor, fuente);
  assert.equal(primera.pedirPista(), envido.pasos[0].pista);
  primera.responder(seleccion);
  primera.responder(total);
  const repetida = { ...primera.situacion, id: "otro-caso", semilla: 12, cartas: [...primera.situacion.cartas].reverse() };
  const segunda = iniciarSesion(envido, repetida, proveedor.evaluar, fuente);
  segunda.responder(seleccion);
  segunda.responder(total);
  const { casos } = progresoDe(fuente.actual, envido.habilidad);
  assert.equal(casos.length, 1);
  assert.equal(casos[0].acreditado, false);
});

test("la mesa puede presentar su propia situación de flor sin generar otra mano", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  const leccion: Leccion = { id: "flor", habilidad: "reconocer-flor", familias: ["un-palo"], titulo: "Reconocer flor",
    capitulo: "flor", pasos: [{ id: "flor", tipo: "decidir-flor", consigna: "¿Tenés flor?", pista: "Mirá los palos." }] };
  const situacion: SituacionVisible = {
    id: "mesa-3", clave: "oros-1/3/7@muestra-bastos-06", habilidad: leccion.habilidad, familia: "un-palo",
    muestra: "bastos-06", cartas: ["oros-01", "oros-03", "oros-07"], explicacion: "Tres oros forman flor.",
  };
  const sesion = iniciarSesion(leccion, situacion, (mano, paso, respuesta) => {
    assert.equal(mano, situacion);
    assert.equal(paso.tipo, "decidir-flor");
    assert.equal(respuesta.tipo, "decidir-flor");
    return { correcta: respuesta.hayFlor, explicacion: mano.explicacion };
  }, fuente);
  assert.equal(sesion.responder({ tipo: "decidir-flor", hayFlor: true }).correcta, true);
  assert.equal(sesion.completada, true);
  assert.equal(progresoDe(fuente.actual, leccion.habilidad).casos[0].acreditado, true);
});

test("una recarga tras equivocarse conserva el error y la identidad de la mano", () => {
  let datos: string | null = null;
  const obtenerAlmacen = () => ({
    getItem: () => datos,
    setItem: (_clave: string, valor: string) => { datos = valor; },
  });
  const primera = generarSesion(envido, 1, proveedor, crearFuenteProgreso(obtenerAlmacen));
  primera.responder(seleccion);
  primera.responder(totalErrado);
  const fuente = crearFuenteProgreso(obtenerAlmacen);
  const repetida = iniciarSesion(envido, primera.situacion, proveedor.evaluar, fuente);
  repetida.responder(seleccion);
  repetida.responder(totalErrado);
  assert.equal(repetida.pista, ayuda);
  repetida.responder(total);
  assert.deepEqual(fuente.actual.habilidades[0].casos, [
    { clave: primera.situacion.clave, familia: "una-pieza", acreditado: false },
  ]);
});

test("comprueba la semilla, la familia pedida y la correspondencia entre situación y lección", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  for (const semilla of [-1, 0x100000000, 1.5]) {
    assert.throws(() => generarSesion(envido, semilla, proveedor, fuente), /semilla/);
  }
  assert.throws(() => generarSesion(envido, 0, proveedor, fuente, "desconocida"), /Familia/);
  const situacion = proveedor.generar({ habilidad: "contar-flor", familia: "una-pieza", semilla: 0, recientes: [] });
  assert.throws(() => iniciarSesion(envido, situacion, proveedor.evaluar, fuente), /habilidad/);
  assert.throws(() => generarSesion(envido, 0, { ...proveedor, generar: () => ({ ...situacion, familia: "otra" }) }, fuente), /familia/);
  assert.deepEqual(fuente.actual.habilidades, []);
});
