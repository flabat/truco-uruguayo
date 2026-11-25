import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaDeCarta, calcularMesa, contiene, seCortan, unir, type EntradaMesa, type Geometria, type Lance, type Modalidad, type Rect } from "../src/index.ts";

const pantallas = [[360, 640], [390, 844], [430, 932], [768, 1024], [1440, 900]] as const;

interface Caso { modalidad: Modalidad; lance?: Lance; nombre: string }

const casos: Caso[] = [
  { modalidad: "1v1", nombre: "1v1" },
  { modalidad: "2v2", nombre: "2v2" },
  { modalidad: "3v3", lance: { tipo: "redondilla" }, nombre: "redondilla" },
];
for (const a of [0, 2, 4]) {
  for (const b of [1, 3, 5]) casos.push({ modalidad: "3v3", lance: { tipo: "pico", activos: [a, b] }, nombre: `pico ${a}-${b}` });
}

const jugadores = (m: Modalidad) => (m === "1v1" ? 2 : m === "2v2" ? 4 : 6);

function bloques(g: Geometria): [string, Rect][] {
  const lista: [string, Rect][] = [["barra", g.barra], ["estado", g.estado]];
  if (g.lance) lista.push(["lance", g.lance]);
  for (const a of g.asientos) {
    const partes = [a.rotulo, a.jugada && cajaDeCarta(a.jugada), ...a.dorsos.map(cajaDeCarta)].filter((r): r is Rect => r != null);
    if (a.lugar === "abajo") {
      // El rótulo propio va en la fila inferior y su jugada en el paño: son bloques aparte.
      if (a.rotulo) lista.push([`rótulo ${a.asiento}`, unir([a.rotulo, ...a.dorsos.map(cajaDeCarta)])]);
      if (a.jugada) lista.push([`jugada ${a.asiento}`, cajaDeCarta(a.jugada)]);
    } else if (partes.length > 0) lista.push([`asiento ${a.asiento}`, unir(partes)]);
  }
  lista.push(["mazo", unir([cajaDeCarta(g.mazo.muestra), cajaDeCarta(g.mazo.mazo), g.mazo.rotulo])]);
  if (g.mano.length > 0) lista.push(["mano", unir(g.mano.map(cajaDeCarta))]);
  if (g.cantos) lista.push(["cantos", g.cantos]);
  if (g.espectador) lista.push(["espectador", g.espectador]);
  if (g.tira) lista.push(["tira", g.tira]);
  if (g.paneles) lista.push(["panel izquierdo", g.paneles.izquierdo], ["panel derecho", g.paneles.derecho]);
  if (g.hoja) lista.push(["hoja", g.hoja]);
  return lista;
}

function todosLosRect(g: Geometria): Rect[] {
  return [
    ...bloques(g).map(([, r]) => r),
    g.pano, g.columna,
    ...g.asientos.flatMap(a => [a.rotulo, a.jugada && cajaDeCarta(a.jugada), ...a.dorsos.map(cajaDeCarta)]).filter((r): r is Rect => r != null),
    ...g.mano.map(cajaDeCarta),
  ];
}

function revisar(g: Geometria, e: EntradaMesa, nombre: string) {
  for (const r of todosLosRect(g)) assert.ok(contiene(g.pantalla, r), `${nombre}: se sale de pantalla ${JSON.stringify(r)}`);
  const lista = bloques(g);
  for (let i = 0; i < lista.length; i++) {
    for (let k = i + 1; k < lista.length; k++) {
      const [na, a] = lista[i];
      const [nb, b] = lista[k];
      if ((na === "hoja" || nb === "hoja") && ["tira", "panel izquierdo", "panel derecho"].includes(na === "hoja" ? nb : na)) continue;
      assert.ok(!seCortan(a, b), `${nombre}: se cortan ${na} y ${nb}`);
    }
  }
  const mazo = unir([cajaDeCarta(g.mazo.muestra), cajaDeCarta(g.mazo.mazo), g.mazo.rotulo]);
  assert.ok(contiene(g.pano, mazo), `${nombre}: el mazo sale del paño`);
  for (const a of g.asientos) {
    if (a.lugar !== "abajo" && a.rotulo) assert.ok(contiene(g.pano, a.rotulo), `${nombre}: el asiento ${a.asiento} sale del paño`);
    if (a.jugada) assert.ok(contiene(g.pano, cajaDeCarta(a.jugada)), `${nombre}: la jugada de ${a.asiento} sale del paño`);
  }
  if (g.mano.length > 0) assert.ok(!seCortan(g.pano, unir(g.mano.map(cajaDeCarta))), `${nombre}: la mano pisa el paño`);
  // El mazo, a la derecha de quien dio (desde su punto de vista).
  const dador = g.asientos[e.dador].ancla;
  const centro = { x: g.pano.x + g.pano.ancho / 2, y: g.pano.y + g.pano.alto / 2 };
  const c = { x: mazo.x + mazo.ancho / 2, y: mazo.y + mazo.alto / 2 };
  const f = { x: centro.x - dador.x, y: centro.y - dador.y };
  assert.ok((c.x - dador.x) * -f.y + (c.y - dador.y) * f.x > 0, `${nombre}: el mazo no está a la derecha del dador`);
}

for (const [ancho, alto] of pantallas) {
  test(`${ancho} × ${alto}: nada se superpone ni se sale, en cada modalidad y con cada dador`, () => {
    let revisados = 0;
    for (const caso of casos) {
      const n = jugadores(caso.modalidad);
      for (let dador = 0; dador < n; dador++) {
        for (const propio of [0, 1, null]) {
          for (const hoja of [null, { alto: 320 }]) {
            const e: EntradaMesa = {
              ancho, alto, modalidad: caso.modalidad, lance: caso.lance, propio, vistaDesde: 1,
              dador, mano: (dador + 1) % n, cartas: Array.from({ length: n }, (_, i) => 3 - (i % 2)), hoja,
            };
            revisar(calcularMesa(e), e, `${caso.nombre}, dador ${dador}, ${propio == null ? "espectador" : "asiento " + propio}${hoja ? ", con hoja" : ""}`);
            revisados++;
          }
        }
      }
    }
    assert.ok(revisados > 300);
  });
}

test("en 360 × 640 la mano sigue grande", () => {
  for (const caso of casos) {
    const n = jugadores(caso.modalidad);
    const g = calcularMesa({ ancho: 360, alto: 640, modalidad: caso.modalidad, lance: caso.lance, propio: 0, dador: 0, mano: 1, cartas: Array(n).fill(3) });
    assert.ok(g.mano[0].ancho >= 80, `${caso.nombre}: ${g.mano[0].ancho}`);
  }
});
