import assert from "node:assert/strict";
import test from "node:test";
import { presentarResultado, contrastarCartas } from "../../src/components/probabilidad/presentacion.ts";
import { referenciaEditorial, aperturaEditorial, segundaEditorial, resultadoCompleto } from "../../src/probabilidad/perfil.ts";

test("las dos referencias publican el denominador, las unidades y el sentido del contraste", () => {
  const salida = referenciaEditorial(aperturaEditorial)!;
  const resumen = presentarResultado(salida, "referencia");
  assert.equal(resumen.metodo, "Cálculo de referencia · Estimación por simulación");
  assert.equal(resumen.denominador, "20.000 repartos simulados");
  assert.match(resumen.lectura, /3 de bastos/);
  assert.match(contrastarCartas(salida, "bastos-03", "copas-02"), /8,78 puntos porcentuales mayor/);
  assert.match(contrastarCartas(salida, "copas-02", "bastos-03"), /8,78 puntos porcentuales menor/);
  const segunda = referenciaEditorial(segundaEditorial)!;
  const exacto = presentarResultado(segunda, "calculo");
  assert.equal(exacto.metodo, "Enumeración exacta");
  assert.match(exacto.lectura, /2 de copas/);
  assert.equal(exacto.filas.find(f => f.carta === "copas-02")?.victorias, "692 de 1.175");
});

test("separar igualdad exacta, muestra inconclusa y una sola alternativa", () => {
  const conteo = { cartas: segundaEditorial.cartas, mundos: 2, victorias: [1, 1],
    pares: [{ i: 0, j: 1, soloA: 1, soloB: 1 }] };
  const empate = resultadoCompleto(segundaEditorial, conteo, "exacto", null);
  assert.match(presentarResultado(empate, "calculo").lectura, /Empate exacto/);
  assert.match(contrastarCartas(empate, "oros-05", "copas-02"), /exactamente las mismas/);
  const muestra = resultadoCompleto(segundaEditorial, conteo, "estimado", 2);
  assert.match(presentarResultado(muestra, "calculo").lectura, /no permite distinguir/);
  assert.match(contrastarCartas(muestra, "oros-05", "copas-02"), /queda abierta/);
  const unica = resultadoCompleto(segundaEditorial, { cartas: ["oros-05"], victorias: [1], mundos: 2, pares: [] }, "exacto", null);
  assert.match(presentarResultado(unica, "calculo").lectura, /una sola carta/);
});
