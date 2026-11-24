import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara } from "@eltruco/motor/mano.ts";
import { repartir, type Asiento, type RepartoV1 } from "@eltruco/motor/reparto.ts";
import { calcularPorLotes, calcularProbabilidades, evaluarMundos, ganaConCarta } from "../../src/probabilidad/calcular.ts";
import { anotarMundo, crearConteo, intervaloPareado, resumir, sumarLote } from "../../src/probabilidad/estadistica.ts";
import { posicionPublica } from "../../src/probabilidad/informacion.ts";
import { aperturaEditorial, claveAnalisis, referenciaEditorial, segundaEditorial } from "../../src/probabilidad/perfil.ts";

test("la apertura reproduce las 20.000 alternativas pareadas del estudio y sus tres intervalos simultáneos", () => {
  const resultado = calcularProbabilidades(aperturaEditorial);
  assert.equal(resultado.tipo, "completo");
  assert.equal(resultado.perfil, "apertura-20000-v1");
  assert.equal(resultado.metodo, "estimado");
  assert.equal(resultado.semilla, 29);
  assert.equal(resultado.propuestas, 20000);
  assert.equal(resultado.mundos, 20000);
  assert.deepEqual(resultado.filas.map(fila => [fila.carta, fila.victorias]), [
    ["oros-05", 12530], ["copas-02", 12023], ["bastos-03", 13779],
  ]);
  assert.deepEqual(resultado.pares.map(par => [par.a, par.b, par.soloA, par.soloB]), [
    ["oros-05", "copas-02", 1926, 1419], ["oros-05", "bastos-03", 1152, 2401], ["copas-02", "bastos-03", 344, 2100],
  ]);
  const margen = Math.sqrt(2 * Math.log(120) / 20000);
  for (const { diferencia, intervalo95 } of resultado.pares) {
    assert.deepEqual(intervalo95, [diferencia - margen, diferencia + margen]);
  }
  assert.deepEqual(resultado, referenciaEditorial(aperturaEditorial));
  assert.equal(referenciaEditorial({ ...aperturaEditorial, version: 2 }), null);
});

test("la enumeración de segunda vuelta coincide con el oráculo independiente de 24.360 asignaciones", () => {
  const texto = execFileSync(process.execPath, ["docs/aprendizaje/probabilidad/auditar-segunda.mjs"], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8",
  });
  const { asignaciones, compatibles, resultados } = JSON.parse(texto);
  const resultado = calcularProbabilidades(segundaEditorial);
  assert.equal(resultado.tipo, "completo");
  assert.equal(resultado.metodo, "exacto");
  assert.equal(resultado.perfil, "segunda-exacta-v1");
  assert.equal(resultado.semilla, null);
  assert.equal(asignaciones, 24360);
  assert.equal(resultado.mundos, compatibles);
  assert.deepEqual(resultado.filas.map(fila => fila.victorias), [
    resultados.ambas + resultados.soloCinco, resultados.ambas + resultados.soloDos,
  ]);
  const [par] = resultado.pares;
  assert.equal(par.soloA, resultados.soloCinco);
  assert.equal(par.soloB, resultados.soloDos);
  assert.deepEqual(par.intervalo95, [par.diferencia, par.diferencia]);
  assert.deepEqual(resultado, referenciaEditorial(segundaEditorial));
});

test("el perfil de práctica conserva el cálculo al cambiar lotes, orden de alternativas y reparto oculto", () => {
  const reparto = repartir(217, 3);
  const distinto: RepartoV1 = { ...reparto, semilla: 222, manos: [
    [reparto.manos[0][2], reparto.manos[0][1], reparto.manos[0][0]],
    reparto.manos[2], reparto.manos[3], reparto.manos[1],
  ] };
  const [primera, otra] = [reparto, distinto].map(r => posicionPublica(vistaPara(iniciarMano(r), 0)));
  assert.equal(claveAnalisis(primera), claveAnalisis(otra));
  assert.equal(referenciaEditorial(primera), null);
  const calculo = calcularPorLotes(primera, 293);
  let paso = calculo.next();
  let lotes = 0;
  while (!paso.done) {
    lotes++;
    assert.equal(paso.value.mundos, lotes * 293);
    assert.equal(paso.value.mundos, paso.value.propuestas);
    assert.equal("filas" in paso.value, false);
    paso = calculo.next();
  }
  assert.ok(lotes > 0);
  const resultado = paso.value;
  assert.equal(resultado.tipo, "completo");
  assert.equal(resultado.perfil, "practica-v1");
  assert.equal(resultado.mundos, 4096);
  assert.deepEqual(resultado, calcularProbabilidades(otra));
});

test("sumar lotes conserva los discordantes, distingue empates exactos y diferencias inconclusas", () => {
  const cartas = ["copas-02", "oros-05"] as const;
  const uno = crearConteo(cartas);
  const otro = crearConteo(cartas);
  anotarMundo(uno, [true, false]);
  anotarMundo(otro, [false, true]);
  sumarLote(uno, otro);
  assert.deepEqual(resumir(uno, "exacto").pares[0], {
    a: cartas[0], b: cartas[1], soloA: 1, soloB: 1, diferencia: 0, intervalo95: [0, 0],
  });
  anotarMundo(uno, [true, false]);
  const [par] = resumir(uno, "estimado").pares;
  assert.equal(par.diferencia, 1 / 3);
  assert.deepEqual(par.intervalo95, [-1, 1]);
  assert.deepEqual(intervaloPareado(1, 1, 1), [-1, 1]);
  assert.throws(() => sumarLote(uno, crearConteo([...cartas].reverse())), RangeError);
  assert.throws(() => anotarMundo(uno, [true]), RangeError);
  assert.throws(() => resumir(crearConteo([]), "estimado"), RangeError);
});

test("las continuaciones respetan dos cierres tempranos y tres pardas con ambos equipos", () => {
  // Vectores del motor. Cada jugador eligió sus cartas en orden de recepción antes de la jugada final.
  for (const [semilla, cantidad, ganador] of [[2, 8, 1], [4, 8, 0], [99121, 12, 0], [217, 12, 0]] as const) {
    let estado = iniciarMano(repartir(semilla, 3));
    for (let i = 0; i < cantidad; i++) {
      assert.ok(estado.turno !== null);
      const asiento = estado.turno;
      const carta = estado.restantes[asiento][0];
      if (i === cantidad - 1) assert.equal(ganaConCarta(estado, carta), asiento % 2 === ganador);
      const paso = jugarCarta(estado, { asiento, carta });
      assert.ok(paso.ok);
      estado = paso.estado;
    }
    assert.equal(estado.equipoGanador, ganador);
  }
});

test("posición inválida, turno ajeno, turno obligado y mano cerrada se distinguen", () => {
  assert.equal(calcularProbabilidades(null).tipo, "entrada-invalida");
  assert.throws(() => calcularPorLotes(aperturaEditorial, 0).next(), RangeError);
  let estado = iniciarMano(repartir(4, 3));
  assert.equal(calcularProbabilidades(posicionPublica(vistaPara(estado, 1))).tipo, "fuera-de-turno");
  let obligada = false;
  while (estado.turno !== null) {
    const asiento: Asiento = estado.turno;
    const vista = vistaPara(estado, asiento);
    if (!obligada && vista.cartas.length === 1) {
      const resultado = calcularProbabilidades(posicionPublica(vista));
      assert.equal(resultado.tipo, "completo");
      assert.equal(resultado.filas.length, 1);
      assert.equal(resultado.filas[0].carta, vista.cartas[0]);
      assert.deepEqual(resultado.pares, []);
      obligada = true;
    }
    const paso = jugarCarta(estado, { asiento, carta: elegirJugada(vista) });
    assert.ok(paso.ok);
    estado = paso.estado;
  }
  assert.ok(obligada);
  assert.equal(calcularProbabilidades(posicionPublica(vistaPara(estado, 0))).tipo, "mano-terminada");
});

test("agotar propuestas sin llegar al tamaño fijo devuelve diagnóstico sin clasificación parcial", () => {
  const posicion = posicionPublica(vistaPara(iniciarMano(repartir(217, 3)), 0));
  const sinMundos = {
    tipo: "disponible", posicion, producto: 65537, proponer: () => null,
    enumerar: () => [],
  } as const;
  const muestra = evaluarMundos(sinMundos, 65537).next();
  assert.deepEqual(muestra, {
    done: true, value: { tipo: "presupuesto-agotado", mundos: 0, propuestas: 65536 },
  });
  const exacto = evaluarMundos({ ...sinMundos, producto: 3 }, 64).next();
  assert.deepEqual(exacto, { done: true, value: { tipo: "incompatible" } });
});
