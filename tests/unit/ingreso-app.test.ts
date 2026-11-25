import assert from "node:assert/strict";
import test from "node:test";
import { esDesafio, esRetornoLocal, verificadorCorresponde } from "../../api/sesion.ts";

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

test("esRetornoLocal acepta solo el retorno de bucle local de app:web", () => {
  for (const bueno of ["http://localhost:8083/api/auth/retorno-local", "http://127.0.0.1:65535/api/auth/retorno-local"]) {
    assert.equal(esRetornoLocal(bueno), true, bueno);
  }
  for (const malo of [null, "", "eltruco://ingreso", "https://localhost:8083/api/auth/retorno-local",
    "http://localhost/api/auth/retorno-local", "http://localhost:0/api/auth/retorno-local", "http://localhost:65536/api/auth/retorno-local",
    "http://localhost:8083/api/auth/retorno-local?x=1", "http://localhost:8083/api/auth/retorno-localx",
    "http://localhost.evil.com:8083/api/auth/retorno-local", "http://evil.com/http://localhost:8083/api/auth/retorno-local",
    "http://user@localhost:8083/api/auth/retorno-local", "http://[::1]:8083/api/auth/retorno-local"]) {
    assert.equal(esRetornoLocal(malo), false, String(malo));
  }
});
