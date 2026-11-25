import assert from "node:assert/strict";
import test from "node:test";
import juego from "../../src/data/juego.json" with { type: "json" };
import cantos from "../../src/data/cantos.json" with { type: "json" };
import apendices from "../../src/data/apendices.json" with { type: "json" };

type Bloque = { id: string; heading: string; text: string; items?: string[]; kind?: string };
type Capitulo = { id: string; intro: string; blocks: Bloque[]; variants?: { id: string }[] };
const capitulos = [...juego, ...cantos] as Capitulo[];

// Las fuentes van al apéndice: el texto de las reglas no se apoya en ellas.
const fuentes = /Wikipedia|Gran Aventura|ConectaGames|Ludoteka|Quiero Truco|Quién Anota|Pagat|ServicioTI|Canel[oó]n|Expo Prado|Vidart|Bouton|Silva Vald[eé]s/;

test("las reglas y su presentación no citan fuentes", () => {
  for (const capitulo of capitulos) {
    assert.doesNotMatch(capitulo.intro, fuentes, capitulo.id);
    for (const bloque of capitulo.blocks.filter((b) => b.kind !== "casa")) {
      const texto = [bloque.heading, bloque.text, ...(bloque.items ?? [])].join(" ");
      assert.doesNotMatch(texto, fuentes, `${capitulo.id}#${bloque.id}`);
      assert.doesNotMatch(texto, /[Qq]ueda por (confirmar|precisar|documentar)/, `${capitulo.id}#${bloque.id}`);
    }
  }
});

test("cada capítulo tiene anclas únicas y estables", () => {
  const ids = capitulos.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const capitulo of capitulos) {
    const anclas = [...capitulo.blocks.map((b) => b.id), ...(capitulo.variants ?? []).map((v) => v.id)];
    for (const ancla of anclas) assert.match(ancla, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${capitulo.id}#${ancla}`);
    assert.equal(new Set(capitulo.blocks.map((b) => b.id)).size, capitulo.blocks.length, capitulo.id);
  }
  // El apéndice de variantes reúne las de todos los capítulos en una sola página.
  const variantes = capitulos.flatMap((c) => (c.variants ?? []).map((v) => v.id));
  assert.equal(new Set(variantes).size, variantes.length);
  // Anclas enlazadas desde otras páginas.
  assert.ok(capitulos.find((c) => c.id === "jerarquia")!.blocks.some((b) => b.id === "rey-pieza"));
});

test("el glosario remite a capítulos existentes y está en orden alfabético", () => {
  const ids = new Set(capitulos.map((c) => c.id));
  for (const { termino, capitulo } of apendices.glosario) assert.ok(ids.has(capitulo), termino);
  const terminos = apendices.glosario.map((g) => g.termino);
  assert.deepEqual(terminos, [...terminos].sort((a, b) => a.localeCompare(b, "es")));
});

test("el historial empieza por la edición vigente", () => {
  const fechas = apendices.historial.map((h) => h.fecha);
  assert.deepEqual(fechas, [...fechas].sort().reverse());
  for (const fecha of fechas) assert.match(fecha, /^\d{4}-\d{2}-\d{2}$/);
});
