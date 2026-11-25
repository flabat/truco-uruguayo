import assert from "node:assert/strict";
import test from "node:test";
import { crearEventos } from "../../app/src/mesa/eventos.ts";
import { movimiento, ordenDeReparto, planDeReparto } from "../../app/src/mesa/movimiento.ts";

test("las duraciones normales son las de la tabla del diseño", () => {
  assert.deepEqual(movimiento(false), {
    reparto: { entreCartas: 80 },
    vuelo: { duracion: 320, rebote: true },
    ganadora: { duracion: 600 },
    globo: { duracion: 220 },
    contador: { duracion: 500 },
  });
});

test("en modo liviano no hay reparto ni vuelo ni brillo animado ni cuenta", () => {
  assert.deepEqual(movimiento(true), {
    reparto: null,
    vuelo: { duracion: 0, rebote: false },
    ganadora: { duracion: 0 },
    globo: { duracion: 220 },
    contador: { duracion: 0 },
  });
});

test("en 1 contra 1 reparte primero el de la derecha del dador, tres vueltas", () => {
  assert.deepEqual(ordenDeReparto(0, 2), [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(ordenDeReparto(1, 2), [0, 1, 0, 1, 0, 1]);
});

test("en parejas el reparto sigue el sentido antihorario desde la mano", () => {
  assert.deepEqual(ordenDeReparto(0, 4), [1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0]);
  assert.deepEqual(ordenDeReparto(3, 4), [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
});

test("en tercetos da la vuelta a los seis asientos y termina en el dador", () => {
  const orden = ordenDeReparto(4, 6);
  assert.deepEqual(orden.slice(0, 6), [5, 0, 1, 2, 3, 4]);
  assert.equal(orden.length, 18);
  assert.deepEqual(orden.slice(6, 12), orden.slice(0, 6));
  assert.deepEqual(orden.slice(12), orden.slice(0, 6));
});

test("los oyentes de la mesa reciben cada evento en orden y se pueden quitar", () => {
  const eventos = crearEventos();
  const vistos: string[] = [];
  const quitar = eventos.escuchar(e => vistos.push("a:" + e.tipo));
  eventos.escuchar(e => vistos.push("b:" + e.tipo));
  eventos.emitir({ tipo: "reparto", dador: 0 });
  quitar();
  const { emitir } = eventos;
  emitir({ tipo: "chico", nuestro: true });
  assert.deepEqual(vistos, ["a:reparto", "b:reparto", "b:chico"]);
});

const tiempos = { entreCartas: 80, vuelo: 320 };

test("el plan del reparto larga una carta cada 80 ms y al final da vuelta las propias", () => {
  const plan = planDeReparto(0, [3, 3], 0, tiempos);
  assert.deepEqual(plan.vuelos.map(v => [v.asiento, v.ronda, v.sale]), [
    [1, 0, 0], [0, 0, 80], [1, 1, 160], [0, 1, 240], [1, 2, 320], [0, 2, 400],
  ]);
  // La última llega a los 720 ms; las propias giran de a una, cada 80 ms.
  assert.deepEqual(plan.vuelos.map(v => v.gira), [null, 720, null, 800, null, 880]);
  assert.equal(plan.fin, 880 + 320);
});

test("el plan saltea las cartas que ya no están y el espectador no da vuelta ninguna", () => {
  const plan = planDeReparto(3, [3, 2, 3, 3], null, tiempos);
  assert.equal(plan.vuelos.length, 11);
  assert.ok(!plan.vuelos.some(v => v.asiento === 1 && v.ronda === 2));
  assert.deepEqual(plan.vuelos.map(v => v.sale), plan.vuelos.map((_, i) => i * 80));
  assert.ok(plan.vuelos.every(v => v.gira === null));
  assert.equal(plan.fin, 10 * 80 + 320);
  assert.deepEqual(planDeReparto(0, [0, 0], 0, tiempos), { vuelos: [], duracion: 320, fin: 0 });
});
