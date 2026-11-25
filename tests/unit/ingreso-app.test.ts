import assert from "node:assert/strict";
import test from "node:test";
import { esDesafio, verificadorCorresponde } from "../../api/sesion.ts";

const verificador = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const desafio = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("el verificador de RFC 7636 corresponde a su desafío", () => {
  assert.equal(verificadorCorresponde(verificador, desafio), true);
  assert.equal(verificadorCorresponde(verificador.slice(0, -1) + "j", desafio), false);
  assert.equal(verificadorCorresponde(verificador, desafio.slice(0, -1) + "N"), false);
  assert.equal(verificadorCorresponde("", desafio), false);
});

test("esDesafio acepta 43 caracteres base64url", () => {
  assert.equal(esDesafio(desafio), true);
  for (const malo of [null, "", desafio.slice(1), desafio + "A", desafio.slice(1) + "+", desafio.slice(1) + "/", desafio.slice(1) + "="]) {
    assert.equal(esDesafio(malo), false, String(malo));
  }
});
