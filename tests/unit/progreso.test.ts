import assert from "node:assert/strict";
import test from "node:test";
import { crearFuenteProgreso, elegirHabilidad, erroresRecientes, estaAprendida, progresoDe } from "../../src/aprendizaje/progreso.ts";
import type { FuenteProgreso } from "../../src/aprendizaje/progreso.ts";
import type { Leccion } from "../../src/aprendizaje/tipos.ts";

const comparar = "comparar-cartas";
const flor = "reconocer-flor";
const familias = ["mayor", "menor", "empate"];

function resolver(fuente: FuenteProgreso, habilidad: string, familia: string, clave: string, correcta = true) {
  const caso = { habilidad, familia, clave };
  const nueva = fuente.abrirSituacion(caso);
  fuente.registrarRespuesta(caso, correcta, nueva && correcta);
}

function leccion(habilidad: string): Leccion {
  return { id: habilidad, titulo: habilidad, habilidad, familias: ["ejemplo"], capitulo: "cartas",
    pasos: [{ id: "cartas", tipo: "elegir-cartas", consigna: "Elegí una carta.", pista: "Mirá la muestra.", minimo: 1, maximo: 1 }] };
}

function almacenDePrueba(inicial: string | null = null) {
  let datos = inicial;
  return {
    getItem: (_clave: string) => datos,
    setItem(_clave: string, valor: string) { datos = valor; },
  };
}

test("Aprendido requiere manos distintas y cobertura, con política configurable", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  resolver(fuente, comparar, "mayor", "A");
  resolver(fuente, comparar, "mayor", "B");
  resolver(fuente, comparar, "menor", "B"); // La misma firma tampoco cuenta en otra familia.
  resolver(fuente, comparar, "mayor", "C");
  assert.equal(estaAprendida(fuente.actual, comparar, familias), false);
  assert.equal(estaAprendida(fuente.actual, comparar, ["mayor"]), true);
  resolver(fuente, comparar, "menor", "D");
  assert.equal(estaAprendida(fuente.actual, comparar, familias), true);
  const exigente = { aciertos: 5, familias: 3 };
  assert.equal(estaAprendida(fuente.actual, comparar, familias, exigente), false);
  resolver(fuente, comparar, "empate", "E");
  assert.equal(estaAprendida(fuente.actual, comparar, familias, exigente), true);
  resolver(fuente, comparar, "empate", "F", false);
  assert.equal(estaAprendida(fuente.actual, comparar, familias, exigente), true);
  assert.equal(progresoDe(fuente.actual, comparar).casos.length, 6);
  assert.equal(estaAprendida(fuente.actual, flor, familias), false);
});

test("tres manos nuevas de dos familias ya alcanzan el umbral inicial", () => {
  const fuente = crearFuenteProgreso(() => undefined);
  resolver(fuente, comparar, "mayor", "A");
  resolver(fuente, comparar, "empate", "B");
  assert.equal(estaAprendida(fuente.actual, comparar, familias), false);
  resolver(fuente, comparar, "mayor", "C");
  assert.equal(estaAprendida(fuente.actual, comparar, familias), true);
});

test("el historial sobrevive a la recarga y una situación antigua sigue sin duplicar evidencia", () => {
  const almacen = almacenDePrueba();
  const fuente = crearFuenteProgreso(() => almacen);
  resolver(fuente, comparar, "mayor", "fallida", false);
  for (let i = 1; i <= 10; i++) resolver(fuente, comparar, "mayor", String(i));
  const antes = fuente.actual;
  const recarga = crearFuenteProgreso(() => almacen);
  assert.deepEqual(recarga.actual, antes);
  assert.equal(JSON.parse(almacen.getItem("")!).version, 1);
  const vista = progresoDe(recarga.actual, comparar);
  assert.equal(vista.recientes[0], "10");
  assert.ok(!vista.recientes.includes("fallida"));
  assert.equal(erroresRecientes(vista), 0);
  resolver(recarga, comparar, "mayor", "fallida");
  resolver(recarga, comparar, "mayor", "1");
  const despues = progresoDe(recarga.actual, comparar);
  assert.equal(despues.casos.length, 11);
  assert.equal(despues.casos.filter((caso) => caso.acreditado).length, 10);
  assert.equal(despues.casos.find((caso) => caso.clave === "fallida")?.acreditado, false);
  // Otra fuente del mismo navegador ve la actualización antes de escribir su habilidad.
  resolver(fuente, flor, "un-palo", "1");
  assert.equal(progresoDe(recarga.actual, flor).casos.length, 1);
  assert.deepEqual(progresoDe(fuente.actual, comparar), despues);
});

test("formato desconocido, JSON roto o estructuras inválidas permiten recuperar el guardado", () => {
  const h = { habilidad: comparar, casos: [], recientes: [], ultimosResultados: [] };
  for (const inicial of [
    "{", "null", "[]", '{"version":2,"habilidades":[]}', '{"version":1}',
    JSON.stringify({ version: 1, habilidades: [null] }),
    JSON.stringify({ version: 1, habilidades: [{ ...h, casos: [{ acreditado: "no" }] }] }),
    JSON.stringify({ version: 1, habilidades: [{ ...h, recientes: ["ausente"] }] }),
    JSON.stringify({ version: 1, habilidades: [{ ...h, ultimosResultados: [1] }] }),
    JSON.stringify({ version: 1, habilidades: [h, h] }),
  ]) {
    const almacen = almacenDePrueba(inicial);
    const fuente = crearFuenteProgreso(() => almacen);
    assert.deepEqual(fuente.actual, { version: 1, habilidades: [] });
    resolver(fuente, comparar, "empate", "A");
    assert.equal(crearFuenteProgreso(() => almacen).actual.habilidades[0].casos[0].acreditado, true);
  }
});

test("si el almacenamiento es inaccesible o se agota la cuota, se conserva el progreso en memoria", () => {
  const denegado = () => { throw new Error("Acceso denegado"); };
  for (const obtener of [denegado, () => ({ getItem: denegado, setItem: denegado })]) {
    const fuente = crearFuenteProgreso(obtener);
    resolver(fuente, flor, "un-palo", "F");
    assert.equal(progresoDe(fuente.actual, flor).casos[0].acreditado, true);
  }
  const almacen = almacenDePrueba();
  resolver(crearFuenteProgreso(() => almacen), comparar, "empate", "A");
  const sinCuota = crearFuenteProgreso(() => ({ ...almacen, setItem: denegado }));
  resolver(sinCuota, comparar, "menor", "B");
  resolver(sinCuota, comparar, "mayor", "C");
  assert.equal(estaAprendida(sinCuota.actual, comparar, familias), true);
  assert.equal(crearFuenteProgreso(() => almacen).actual.habilidades[0].casos.length, 1);
});

test("la práctica empieza con jerarquía y flor, permite elegir tema y pondera las habilidades vistas", () => {
  const envido = "contar-envido";
  const catalogo = [envido, flor, comparar, comparar].map(leccion);
  const fuente = crearFuenteProgreso(() => undefined);
  const elegir = (azar: number, tema?: string) => elegirHabilidad(catalogo, fuente.actual, { azar: () => azar, tema });
  assert.equal(elegir(0.9), comparar);
  assert.equal(elegir(0, envido), envido);
  assert.throws(() => elegir(0, "otra"), /catálogo/);
  resolver(fuente, comparar, "empate", "A", false);
  assert.equal(elegir(0), flor);
  resolver(fuente, flor, "un-palo", "F");
  resolver(fuente, comparar, "menor", "B", false);
  // En orden del catálogo, flor pesa 1 y comparación pesa 3.
  assert.equal(elegir(0), flor);
  assert.equal(elegir(0.249), flor);
  assert.equal(elegir(0.25), comparar);
  assert.equal(elegir(0.99), comparar);
  for (let i = 0; i < 8; i++) resolver(fuente, comparar, "mayor", String(i));
  assert.equal(elegir(0.49), flor);
  assert.equal(elegir(0.5), comparar);
  assert.equal(elegir(0, comparar), comparar);
  assert.equal(elegir(0, envido), envido);
  assert.equal(elegirHabilidad([leccion("nueva")], fuente.actual), "nueva");
});
