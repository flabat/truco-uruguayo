import assert from "node:assert/strict";
import test from "node:test";
import { calcularMesa, type Rect } from "@eltruco/mesa-geometria";
import { cajaDeAsiento, cajasDelMazo, lugarDelGlobo, limitesDeGlobo } from "../../app/src/mesa/lugar-globo.ts";

const seCortan = (a: Rect, b: Rect) =>
  a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

// Navegadores de teléfonos Android y iPhone, sin la barra del navegador.
const pantallas = [[360, 640], [360, 740], [375, 760], [384, 740], [393, 760], [412, 780], [412, 840], [430, 860]] as const;
// El globo de señas con uno, dos y tres gestos (64 de ancho cada uno, 8 entre ellos, 10 de margen).
const globos = [1, 2, 3].map(n => ({ ancho: Math.max(20 + n * 64 + (n - 1) * 8, 130), alto: 90 }));

function mesa2v2(ancho: number, alto: number, dador: number) {
  return calcularMesa({ ancho, alto, modalidad: "2v2", propio: 0, dador, mano: (dador + 1) % 4, cartas: [3, 3, 3, 3] });
}

test("en parejas, el globo de señas del compañero nunca tapa la muestra ni el mazo en un teléfono", () => {
  for (const [ancho, alto] of pantallas) for (const dador of [0, 1, 2, 3]) for (const tamano of globos) {
    const g = mesa2v2(ancho, alto, dador);
    const frente = g.asientos.find(a => a.lugar === "frente")!;
    const l = lugarDelGlobo(frente, "debajo", tamano, limitesDeGlobo(g, frente.asiento));
    const caja = { x: l.left, y: l.top, ...tamano };
    for (const r of cajasDelMazo(g))
      assert.ok(!seCortan(r, caja), `${ancho}×${alto}, da ${dador}, globo de ${tamano.ancho}: tapa ${JSON.stringify(r)}`);
    assert.ok(caja.x >= g.columna.x && caja.x + caja.ancho <= g.columna.x + g.columna.ancho, `${ancho}×${alto}: se sale`);
    assert.ok(caja.y + caja.alto <= g.estado.y, `${ancho}×${alto}: baja hasta el estado`);
  }
});

test("el caso reportado: 393 × 760, da el de la derecha, el globo baja debajo del mazo sin punta", () => {
  const g = mesa2v2(393, 760, 1);
  const frente = g.asientos.find(a => a.lugar === "frente")!;
  const l = lugarDelGlobo(frente, "debajo", globos[1], limitesDeGlobo(g, frente.asiento));
  const finDelMazo = Math.max(...cajasDelMazo(g).map(r => r.y + r.alto));
  assert.ok(l.top >= finDelMazo, "queda debajo del mazo");
  assert.equal(l.punta, null);
});

test("con lugar libre, el globo sigue colgando del asiento con la punta hacia arriba", () => {
  const g = mesa2v2(393, 760, 0);
  const frente = g.asientos.find(a => a.lugar === "frente")!;
  const l = lugarDelGlobo(frente, "debajo", globos[1], limitesDeGlobo(g, frente.asiento));
  const caja = cajaDeAsiento(frente);
  assert.equal(l.punta, "arriba");
  assert.equal(l.top, caja.y + caja.alto + 6);
});
