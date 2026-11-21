import assert from "node:assert/strict";
import test from "node:test";
import { edicionModelo, fechaModelo } from "../../src/lib/modelos.ts";

test("la huella o el alias completo identifica la edición publicada", () => {
  const casos = [
    ["d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3", "Ceibo Duelo", "2026-11-20"],
    ["6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2", "Ceibo Parejas", "2026-11-20"],
    ["d2b2293d4d8c9ee4f067ee74c1d6d5983eb5c8ad3a4ebce57bbdb561f946b78b", "Ceibo Parejas con señas", "2026-11-20"],
    ["incumbent-online-v1", "Clásico v1", "2026-11-19"],
    ["tercetos-basica-v1", "Clásico de tercetos v1", "2026-11-19"],
    ["bot-v1", "Práctica v1", "2026-11-18"],
  ];
  for (const [id, nombre, publicado] of casos) {
    assert.deepEqual(edicionModelo(id), { nombre, publicado });
  }
});

test("los modelos sin catalogar conservan una referencia y tienen fecha desconocida", () => {
  const prefijo = "d2146e8dd1b7";
  const otraHuella = prefijo.padEnd(64, "0");
  assert.deepEqual(edicionModelo(otraHuella, "duel"), { nombre: "Modelo de duelo · " + prefijo, publicado: null });
  assert.deepEqual(edicionModelo(prefijo), { nombre: "Modelo de mesa · " + prefijo, publicado: null });
  assert.deepEqual(edicionModelo("experimental-v3", "pairs-private-senas"), {
    nombre: "Modelo de parejas con señas · experimental-v3", publicado: null,
  });
});

test("la fecha civil de publicación se lee en español y conserva el día", () => {
  assert.equal(fechaModelo("2026-11-20"), "20 nov 2026");
  assert.equal(fechaModelo("2024-02-29"), "29 feb 2024");
});
