import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { loadLibrary, standalone } from "../../scripts/tatu/svg.mjs";

const svg = (body: string) => '<svg xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
const components = svg('<defs><linearGradient id="tinta"><stop stop-color="red"/></linearGradient></defs>'
  + '<g id="copas"><path id="trazo" fill="url(#tinta)"/></g><path id="oros" stroke="blue"/>');
const card = svg('<path id="trazo"/><use href="comun.svg#copas"/><use href="comun.svg#trazo"/>');

test("una carta autónoma incluye su marco y sus tintas una sola vez sin colisiones de ID", () => {
  const published = standalone(card, loadLibrary(components));
  assert.doesNotMatch(published, /comun\.svg|id="tatu-comun-oros"/);
  assert.equal(published.match(/id="tatu-comun-trazo"/g)?.length, 1);
  assert.match(published, /id="trazo"/);
  assert.match(published, /url\(#tatu-comun-tinta\)/);
  assert.match(published, /href="#tatu-comun-copas"/);
});

test("una edición individual, de marco o de tinta se propaga solo a las cartas que la usan", () => {
  const original = standalone(card, loadLibrary(components));
  assert.equal(standalone(card, loadLibrary(components.replace("blue", "purple"))), original);
  assert.notEqual(standalone(card, loadLibrary(components.replace("red", "gold"))), original);
  assert.notEqual(standalone(card, loadLibrary(components.replace('id="copas"', 'id="copas" opacity=".5"'))), original);
  assert.notEqual(standalone(card.replace('id="trazo"', 'id="trazo" stroke="green"'), loadLibrary(components)), original);
});

test("una referencia rota, una imagen rasterizada o un identificador duplicado interrumpen la exportación", () => {
  const library = loadLibrary(components);
  assert.throws(() => standalone(svg('<use href="comun.svg#falta"/>'), library), /Falta/);
  assert.throws(() => standalone(svg('<use href="#falta"/>'), library), /sin resolver/);
  assert.throws(() => standalone(svg('<image href="foto.png"/>'), library), /vectorial/);
  assert.throws(() => loadLibrary(svg('<g id="x"/><g id="x"/>')), /duplicado/);
});

test("el renderizador pinta el color de un motivo compartido con transparencia exterior", async () => {
  const motif = svg('<defs><linearGradient id="rojo"><stop stop-color="#f00"/></linearGradient></defs>'
    + '<rect id="copa" width="4" height="4" fill="url(#rojo)"/>');
  const face = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">'
    + '<use href="comun.svg#copa" x="2" y="2"/></svg>';
  const rendered = await sharp(Buffer.from(standalone(face, loadLibrary(motif)))).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...rendered.subarray(0, 4)], [0, 0, 0, 0]);
  const center = (4 * 8 + 4) * 4;
  assert.deepEqual([...rendered.subarray(center, center + 4)], [255, 0, 0, 255]);
});
