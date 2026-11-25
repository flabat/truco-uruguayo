import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { origenValido, sesionDe } from "../../api/sesion.ts";

const pedido = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const web = new URL("https://eltru.co");

test("el encabezado gana sobre la cookie", () => {
  assert.deepEqual(sesionDe(pedido({ authorization: "Bearer aaa", cookie: "otra=1; truco_sesion=bbb" })),
    { handle: "aaa", via: "encabezado" });
});

test("sin encabezado usa la cookie", () => {
  assert.deepEqual(sesionDe(pedido({ cookie: "otra=1; truco_sesion=bbb" })), { handle: "bbb", via: "cookie" });
});

test("sin encabezado ni cookie no hay sesión", () => {
  assert.equal(sesionDe(pedido({})), null);
});

test("un encabezado mal formado no cae a la cookie", () => {
  for (const authorization of ["Basic x", "Bearer", "Bearer ", "Bearer a b"]) {
    assert.equal(sesionDe(pedido({ authorization, cookie: "truco_sesion=bbb" })), null, authorization);
  }
});

test("origen: encabezado sin Origin es válido; cookie sin Origin no", () => {
  assert.equal(origenValido(pedido({ authorization: "Bearer aaa" }), web), true);
  assert.equal(origenValido(pedido({ cookie: "truco_sesion=bbb" }), web), false);
  assert.equal(origenValido(pedido({ cookie: "truco_sesion=bbb", origin: "https://otro.example" }), web), false);
});

test("cookie con Origin del juego es válida", () => {
  assert.equal(origenValido(pedido({ cookie: "truco_sesion=bbb", origin: "https://eltru.co" }), web), true);
});
