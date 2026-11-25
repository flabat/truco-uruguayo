import assert from "node:assert/strict";
import test from "node:test";
import { chicoTrasEvento, crearEventos } from "../../app/src/mesa/eventos.ts";
import {
  alCentroDelPano, duracionDelReparto, maximoDeParticulas, movimiento, ordenDeReparto, particulasDelFestejo, planDeReparto,
  posicionDeParticula,
} from "../../app/src/mesa/movimiento.ts";

test("las duraciones normales son las de la tabla del diseño", () => {
  assert.deepEqual(movimiento(false), {
    reparto: { entreCartas: 80 },
    vuelo: { duracion: 320, rebote: true },
    ganadora: { duracion: 600 },
    globo: { duracion: 220 },
    contador: { duracion: 500 },
    festejo: { juntar: 450, cartel: 250, particulas: 24, duracion: 1500 },
  });
});

test("en modo liviano no hay reparto ni vuelo ni brillo animado ni cuenta ni festejo", () => {
  assert.deepEqual(movimiento(true), {
    reparto: null,
    vuelo: { duracion: 0, rebote: false },
    ganadora: { duracion: 0 },
    globo: { duracion: 220 },
    contador: { duracion: 0 },
    festejo: null,
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

test("la espera del reparto nunca es más corta que el reparto de ningún dador ni asiento propio", () => {
  for (const n of [2, 4, 6]) {
    const espera = duracionDelReparto(false, n);
    for (let dador = 0; dador < n; dador++) {
      for (const propio of [null, ...Array.from({ length: n }, (_, i) => i)]) {
        const { fin } = planDeReparto(dador, Array<number>(n).fill(3), propio, tiempos);
        assert.ok(espera >= fin, `${n} asientos, dador ${dador}, propio ${propio}: ${espera} < ${fin}`);
      }
    }
  }
  assert.equal(duracionDelReparto(true, 4), 0);
});

test("el festejo tira 24 partículas como máximo, todas dentro del cartel al salir", () => {
  assert.equal(maximoDeParticulas, 24);
  assert.equal(particulasDelFestejo(300, 200, 100).length, 24);
  assert.equal(particulasDelFestejo(300, 200, 10).length, 10);
  for (const p of particulasDelFestejo(300, 200)) {
    const { x, y, opacidad } = posicionDeParticula(p, 0, 1500);
    assert.ok(x >= 0 && x <= 300 && y >= 0 && y <= 200, `${x}, ${y}`);
    assert.equal(opacidad, 1);
  }
});

test("las partículas se apagan a los 1,5 s y no se ven antes de salir", () => {
  const [p] = particulasDelFestejo(300, 200);
  assert.equal(posicionDeParticula(p!, 1500, 1500).opacidad, 0);
  assert.equal(posicionDeParticula(p!, 2000, 1500).opacidad, 0);
  assert.equal(posicionDeParticula(p!, -10, 1500).opacidad, 0);
  assert.ok(posicionDeParticula(p!, 750, 1500).opacidad > 0);
});

test("las partículas son siempre las mismas para el mismo cartel", () => {
  assert.deepEqual(particulasDelFestejo(300, 200), particulasDelFestejo(300, 200));
});

test("las cartas del paño se juntan en una pila al centro sin cambiar de tamaño", () => {
  const pano = { x: 0, y: 100, ancho: 400, alto: 300 };
  const cartas = [
    { x: 20, y: 120, ancho: 50, alto: 78, rotacion: 0 },
    { x: 300, y: 140, ancho: 50, alto: 78, rotacion: 0 },
    { x: 160, y: 300, ancho: 50, alto: 78, rotacion: 0 },
  ];
  const pila = alCentroDelPano(cartas, pano);
  assert.equal(pila.length, 3);
  const centroX = pila.reduce((s, c) => s + c.x + c.ancho / 2, 0) / 3;
  const centroY = pila.reduce((s, c) => s + c.y + c.alto / 2, 0) / 3;
  assert.ok(Math.abs(centroX - 200) < 0.001 && Math.abs(centroY - 250) < 0.001);
  pila.forEach((c, i) => {
    assert.equal(c.ancho, cartas[i]!.ancho);
    assert.equal(c.alto, cartas[i]!.alto);
    assert.ok(Math.abs(c.x + c.ancho / 2 - 200) < c.ancho / 2, "se superponen");
  });
});

test("el chico ganado se recuerda hasta el próximo reparto y cada chico es otro festejo", () => {
  const ganado = chicoTrasEvento(null, { tipo: "chico", nuestro: true });
  assert.deepEqual(ganado, { numero: 1, nuestro: true, festejado: false });
  assert.equal(chicoTrasEvento(ganado, { tipo: "vuelta", ganador: 0, nuestra: true }), ganado);
  assert.equal(chicoTrasEvento(ganado, { tipo: "reparto", dador: 1 }), null);
  assert.deepEqual(chicoTrasEvento({ ...ganado!, festejado: true }, { tipo: "chico", nuestro: false }),
    { numero: 2, nuestro: false, festejado: false });
});
