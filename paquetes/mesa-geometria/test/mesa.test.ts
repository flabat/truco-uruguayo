import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaDeCarta, calcularMesa, seCortan, unir, type EntradaMesa, type Rect } from "../src/index.ts";

function entrada(cambios: Partial<EntradaMesa> = {}): EntradaMesa {
  return { ancho: 390, alto: 844, modalidad: "2v2", propio: 0, dador: 3, mano: 0, cartas: [3, 3, 3, 3], ...cambios };
}

const centroX = (r: Rect) => r.x + r.ancho / 2;
const centroY = (r: Rect) => r.y + r.alto / 2;

test("en parejas tu pareja va al frente y los rivales a los costados", () => {
  const g = calcularMesa(entrada());
  const [vos, derecha, frente, izquierda] = g.asientos;
  assert.equal(vos.lugar, "abajo");
  assert.equal(frente.lugar, "frente");
  assert.ok(Math.abs(centroX(frente.rotulo!) - 195) < 1);
  assert.ok(centroX(derecha.rotulo!) > 260);
  assert.ok(centroX(izquierda.rotulo!) < 130);
  assert.ok(frente.rotulo!.y < derecha.rotulo!.y);
  assert.equal(vos.dorsos.length, 0);
  assert.equal(frente.dorsos.length, 3);
});

test("la mano propia va en abanico, grande", () => {
  const g = calcularMesa(entrada());
  assert.deepEqual(g.mano.map(c => c.rotacion), [-9, 0, 9]);
  assert.ok(g.mano[1].ancho >= 90, `ancho ${g.mano[1].ancho}`);
  assert.ok(g.mano[0].x < g.mano[1].x && g.mano[1].x < g.mano[2].x);
  assert.deepEqual(calcularMesa(entrada({ cartas: [2, 3, 3, 3] })).mano.map(c => c.rotacion), [-5, 5]);
  assert.deepEqual(calcularMesa(entrada({ cartas: [0, 3, 3, 3] })).mano, []);
});

test("Cantos va abajo a la derecha, sobre la tira", () => {
  const g = calcularMesa(entrada());
  assert.ok(g.tira);
  assert.equal(g.tira.alto, 56);
  assert.equal(g.tira.y + g.tira.alto, 844);
  assert.ok(g.cantos);
  assert.ok(centroX(g.cantos) > 195);
  assert.ok(g.cantos.y + g.cantos.alto <= g.tira.y);
  const mano = unir(g.mano.map(cajaDeCarta));
  assert.ok(g.cantos.y >= mano.y + mano.alto - 0.5);
  assert.equal(g.paneles, null);
  assert.equal(g.disposicion, "telefono");
});

test("el mazo va a la derecha de quien dio, del lado de quien es mano", () => {
  // Dio la pareja (2), al frente; es mano el rival de la izquierda (3).
  const g = calcularMesa(entrada({ dador: 2, mano: 3 }));
  const mazo = unir([g.mazo.muestra, cajaDeCarta(g.mazo.mazo)]);
  assert.ok(centroX(mazo) < centroX(g.pano), "en la mitad izquierda");
  assert.ok(centroY(mazo) < centroY(g.pano), "en la mitad de arriba");
  assert.equal(g.mazo.mazo.rotacion, 90);
  // Diste vos: el mazo queda a tu derecha.
  const h = calcularMesa(entrada({ dador: 0, mano: 1 }));
  assert.ok(centroX(h.mazo.muestra) > centroX(h.pano));
});

test("el espectador ve la mesa sin mano ni Cantos", () => {
  const g = calcularMesa(entrada({ propio: null, vistaDesde: 1 }));
  assert.deepEqual(g.mano, []);
  assert.equal(g.cantos, null);
  assert.ok(g.espectador);
  assert.equal(g.asientos[1].lugar, "abajo");
  assert.equal(g.asientos[1].dorsos.length, 3);
  assert.ok(g.asientos[1].rotulo);
});

test("en tercetos la etiqueta del lance va entre la barra y el paño", () => {
  const g = calcularMesa(entrada({ modalidad: "3v3", cartas: [3, 3, 3, 3, 3, 3], dador: 5, mano: 0 }));
  assert.ok(g.lance);
  assert.ok(g.lance.y >= g.barra.y + g.barra.alto);
  assert.ok(g.pano.y >= g.lance.y + g.lance.alto);
  assert.equal(g.asientos[3].forma, "circulo");
  assert.equal(calcularMesa(entrada()).lance, null);
});

test("en el pico a pico el rival del duelo va arriba, grande, y los demás quedan chicos", () => {
  const g = calcularMesa(entrada({ modalidad: "3v3", cartas: [3, 3, 3, 3, 3, 3], dador: 5, mano: 0, lance: { tipo: "pico", activos: [0, 1] } }));
  const rival = g.asientos[1];
  assert.equal(rival.forma, "completo");
  assert.ok(Math.abs(centroX(rival.rotulo!) - 195) < 1);
  assert.equal(rival.dorsos.length, 3);
  for (const a of [2, 3, 4, 5]) {
    assert.equal(g.asientos[a].forma, "punto");
    assert.equal(g.asientos[a].jugada, null);
    assert.equal(g.asientos[a].dorsos.length, 0);
    assert.ok(!seCortan(g.asientos[a].rotulo!, rival.rotulo!));
  }
});

test("con una hoja abierta la mano sube, se achica y no queda tapada", () => {
  const sin = calcularMesa(entrada());
  const g = calcularMesa(entrada({ hoja: { alto: 320 } }));
  assert.ok(g.hoja);
  assert.equal(g.hoja.alto, 320);
  assert.equal(g.hoja.y + g.hoja.alto, 844);
  const mano = unir(g.mano.map(cajaDeCarta));
  assert.ok(!seCortan(mano, g.hoja));
  assert.ok(mano.y + mano.alto <= g.hoja.y + 0.5);
  assert.ok(g.mano[1].ancho < sin.mano[1].ancho);
  assert.equal(g.cantos, null);
  assert.equal(g.asientos[0].rotulo, null);
});

test("una hoja más alta que la pantalla se recorta y la mano sigue a la vista", () => {
  const g = calcularMesa(entrada({ hoja: { alto: 5000 } }));
  assert.ok(g.hoja && g.hoja.alto < 844);
  const mano = unir(g.mano.map(cajaDeCarta));
  assert.ok(mano.y >= 0 && mano.y + mano.alto <= g.hoja.y + 0.5);
  assert.ok(g.pano.alto > 0);
});

test("desde 1024 de ancho la tira pasa a paneles y la mesa va en la columna central", () => {
  const g = calcularMesa(entrada({ ancho: 1440, alto: 900 }));
  assert.equal(g.disposicion, "escritorio");
  assert.equal(g.tira, null);
  assert.ok(g.paneles);
  const { izquierdo, derecho } = g.paneles;
  assert.equal(izquierdo.x, 0);
  assert.equal(derecho.x + derecho.ancho, 1440);
  assert.equal(g.columna.x, izquierdo.ancho);
  for (const carta of g.mano) {
    const caja = cajaDeCarta(carta);
    assert.ok(caja.x >= g.columna.x && caja.x + caja.ancho <= g.columna.x + g.columna.ancho);
  }
  assert.equal(calcularMesa(entrada({ ancho: 1023, alto: 900 })).disposicion, "telefono");
  assert.equal(calcularMesa(entrada({ ancho: 1024, alto: 900 })).disposicion, "escritorio");
});

test("en el escritorio la hoja sube solo dentro de la columna central", () => {
  const g = calcularMesa(entrada({ ancho: 1440, alto: 900, hoja: { alto: 300 } }));
  assert.ok(g.hoja);
  assert.equal(g.hoja.x, g.columna.x);
  assert.equal(g.hoja.ancho, g.columna.ancho);
});
