import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { esDesafio, verificadorCorresponde } from "../../api/sesion.ts";
import { crearAlmacenSesion, type Guardado } from "../../app/src/ingreso/almacen.ts";
import { base64url, crearPar } from "../../app/src/ingreso/pkce.ts";
import { codigoDeRetorno } from "../../app/src/ingreso/retorno.ts";

const sha256 = async (texto: string) => new Uint8Array(createHash("sha256").update(texto).digest());
// Apéndice B de RFC 7636.
const bytesRfc = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186,
  22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
const codigo = "a".repeat(40) + "_-Z";

test("base64url no lleva relleno ni + ni /", () => {
  assert.equal(base64url(new Uint8Array([0xfb, 0xff])), "-_8");
  assert.equal(base64url(new Uint8Array([])), "");
});

test("crearPar reproduce el ejemplo de RFC 7636 y la API lo acepta", async () => {
  const pedidos: number[] = [];
  const par = await crearPar(n => { pedidos.push(n); return new Uint8Array(bytesRfc); }, sha256);
  assert.deepEqual(pedidos, [32]);
  assert.equal(par.verificador, "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(par.desafio, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(verificadorCorresponde(par.verificador, par.desafio), true);
});

test("crearPar con azar real da un desafío que la API acepta", async () => {
  const par = await crearPar(n => new Uint8Array(randomBytes(n)), sha256);
  assert.equal(par.verificador.length, 43);
  assert.equal(esDesafio(par.desafio), true);
  assert.equal(verificadorCorresponde(par.verificador, par.desafio), true);
});

test("codigoDeRetorno solo acepta eltruco://ingreso con un código de canje", () => {
  assert.equal(codigoDeRetorno("eltruco://ingreso?codigo=" + codigo), codigo);
  for (const ajeno of [
    "otraapp://ingreso?codigo=" + codigo,
    "eltruco://otra?codigo=" + codigo,
    "eltruco://ingreso",
    "eltruco://ingreso?codigo=corto",
    "eltruco://ingreso?codigo=" + codigo + "%2B",
    "https://eltru.co/ingreso?codigo=" + codigo,
    "no es una url",
    "",
  ]) assert.equal(codigoDeRetorno(ajeno), null, ajeno);
});

function guardadoEnMemoria() {
  const datos = new Map<string, string>();
  const guardado: Guardado = {
    leer: async clave => datos.get(clave) ?? null,
    guardar: async (clave, valor) => { datos.set(clave, valor); },
    borrar: async clave => { datos.delete(clave); },
  };
  return { datos, guardado };
}

test("crearAlmacenSesion guarda, lee y borra la sesión en truco.sesion", async () => {
  const { datos, guardado } = guardadoEnMemoria();
  const almacen = crearAlmacenSesion(guardado);
  assert.equal(await almacen.leer(), null);
  await almacen.guardar("sesion-secreta");
  assert.deepEqual([...datos], [["truco.sesion", "sesion-secreta"]]);
  assert.equal(await almacen.leer(), "sesion-secreta");
  await almacen.borrar();
  assert.equal(datos.size, 0);
  assert.equal(await almacen.leer(), null);
});
