import assert from "node:assert/strict";
import test from "node:test";
import { elegirJugada } from "../../src/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara } from "../../src/motor/mano.ts";
import { repartir, type Asiento } from "../../src/motor/reparto.ts";
import { calcularProbabilidades } from "../../src/probabilidad/calcular.ts";
import { posicionPublica } from "../../src/probabilidad/informacion.ts";

// Once posiciones no editoriales, calculadas al asignar directamente una de
// las 30 cartas libres a cada asiento ajeno y reproducir las siete decisiones.
// Las columnas A y B conservan el orden en que recibió sus cartas el aprendiz.
const casos = [
  { semilla: 1, mundos: 12457, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 2, mundos: 9712, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 3, mundos: 4284, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 4, mundos: 980, a: 980, b: 980, soloA: 0, soloB: 0 },
  { semilla: 5, mundos: 1253, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 6, mundos: 3588, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 7, mundos: 3003, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 8, mundos: 820, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 9, mundos: 12936, a: 0, b: 0, soloA: 0, soloB: 0 },
  { semilla: 10, mundos: 852, a: 488, b: 488, soloA: 0, soloB: 0 },
  { semilla: 11, mundos: 5684, a: 4005, b: 3807, soloA: 198, soloB: 0 },
];

test("once prefijos de práctica reproducen los conteos independientes para los cuatro asientos", () => {
  const asientos = new Set<Asiento>();
  for (const caso of casos) {
    let estado = iniciarMano(repartir(caso.semilla, (caso.semilla % 4) as Asiento));
    for (let jugadas = 0; jugadas < 7; jugadas++) {
      assert.notEqual(estado.turno, null);
      const asiento = estado.turno!;
      const carta = elegirJugada(vistaPara(estado, asiento));
      const paso = jugarCarta(estado, { asiento, carta });
      assert.ok(paso.ok);
      estado = paso.estado;
    }
    const vista = vistaPara(estado, estado.turno!);
    asientos.add(vista.asiento);
    const [a, b] = vista.cartas;
    const resultado = calcularProbabilidades(posicionPublica(vista));
    assert.ok(resultado.tipo === "completo" && resultado.metodo === "exacto", "Semilla " + caso.semilla);
    assert.equal(resultado.mundos, caso.mundos);
    assert.equal(resultado.filas.find(fila => fila.carta === a)?.victorias, caso.a);
    assert.equal(resultado.filas.find(fila => fila.carta === b)?.victorias, caso.b);
    const [par] = resultado.pares;
    const segunReparto = par.a === a;
    assert.equal(segunReparto ? par.soloA : par.soloB, caso.soloA);
    assert.equal(segunReparto ? par.soloB : par.soloA, caso.soloB);
    assert.equal(par.diferencia, (par.soloA - par.soloB) / caso.mundos);
  }
  assert.equal(asientos.size, 4);
});
