import assert from "node:assert/strict";
import test from "node:test";
import type { Carta, Rect } from "@eltruco/mesa-geometria";
import { soltarCarta } from "../../app/src/mesa/gesto-carta.ts";

// Una carta de la mano en un teléfono de 390 × 844 y el paño encima.
const carta: Carta = { x: 145, y: 640, ancho: 100, alto: 150, rotacion: 0 };
const pano: Rect = { x: 20, y: 200, ancho: 350, alto: 300 };
const centro = { x: 195, y: 715 };

test("un toque quieto dentro de la carta la juega", () => {
  assert.equal(soltarCarta({ inicio: centro, fin: { x: 198, y: 711 }, carta, pano, habilitada: true }), "jugar");
});

test("un toque que se desliza fuera de la carta sin llegar al paño vuelve", () => {
  const inicio = { x: 240, y: 715 };
  assert.equal(soltarCarta({ inicio, fin: { x: 248, y: 715 }, carta, pano, habilitada: true }), "volver");
  assert.equal(soltarCarta({ inicio: centro, fin: { x: 300, y: 715 }, carta, pano, habilitada: true }), "volver");
});

test("la caja de una carta rotada cuenta para el toque", () => {
  const rotada: Carta = { ...carta, rotacion: 12 };
  // Fuera del rectángulo sin rotar, dentro de la caja de la carta rotada.
  assert.equal(soltarCarta({ inicio: { x: 242, y: 700 }, fin: { x: 247, y: 700 }, carta: rotada, pano, habilitada: true }), "jugar");
});

test("arrastrar la carta al paño la juega", () => {
  assert.equal(soltarCarta({ inicio: centro, fin: { x: 190, y: 350 }, carta, pano, habilitada: true }), "jugar");
});

test("un arrastre corto que no llega al paño vuelve", () => {
  assert.equal(soltarCarta({ inicio: centro, fin: { x: 195, y: 560 }, carta, pano, habilitada: true }), "volver");
});

test("lo que decide el arrastre es el centro de la carta, no el dedo", () => {
  // El dedo apoyó arriba de la carta: llega al paño antes que el centro.
  const inicio = { x: 195, y: 645 };
  assert.equal(soltarCarta({ inicio, fin: { x: 195, y: 495 }, carta, pano, habilitada: true }), "volver");
  assert.equal(soltarCarta({ inicio, fin: { x: 195, y: 420 }, carta, pano, habilitada: true }), "jugar");
});

test("deshabilitada siempre vuelve", () => {
  assert.equal(soltarCarta({ inicio: centro, fin: centro, carta, pano, habilitada: false }), "volver");
  assert.equal(soltarCarta({ inicio: centro, fin: { x: 190, y: 350 }, carta, pano, habilitada: false }), "volver");
});

test("si el paño cambió durante el gesto, decide con el paño vigente al soltar", () => {
  const fin = { x: 195, y: 520 };
  assert.equal(soltarCarta({ inicio: centro, fin, carta, pano, habilitada: true }), "volver");
  // Se cerró una hoja y el paño creció hacia abajo mientras el dedo arrastraba.
  const panoNuevo: Rect = { x: 20, y: 200, ancho: 350, alto: 360 };
  assert.equal(soltarCarta({ inicio: centro, fin, carta, pano: panoNuevo, habilitada: true }), "jugar");
  // Y al revés: el paño se achicó y el mismo arrastre ya no llega.
  const fin2 = { x: 195, y: 420 };
  assert.equal(soltarCarta({ inicio: centro, fin: fin2, carta, pano, habilitada: true }), "jugar");
  const panoChico: Rect = { x: 20, y: 200, ancho: 350, alto: 120 };
  assert.equal(soltarCarta({ inicio: centro, fin: fin2, carta, pano: panoChico, habilitada: true }), "volver");
});
