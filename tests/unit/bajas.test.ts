import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { cifrar, descifrar, jwtRevocacion, refreshDeRespuesta } from "../../api/bajas.ts";

const clave = randomBytes(32);

test("el token de Apple se descifra solo con la misma clave y sin cambios", () => {
  const cifrado = cifrar("r.token-de-apple", clave);
  assert.notEqual(cifrado, "r.token-de-apple");
  assert.equal(descifrar(cifrado, clave), "r.token-de-apple");
  assert.throws(() => descifrar(cifrado, randomBytes(32)));
  const bytes = Buffer.from(cifrado, "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => descifrar(bytes.toString("base64"), clave));
  assert.notEqual(cifrar("r.token-de-apple", clave), cifrado, "cada cifrado usa otro vector");
});

test("el JWT de revocación lleva iss, sub, aud y vence en 5 minutos", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const ahora = 1_800_000_000;
  const jwt = jwtRevocacion({ clientId: "co.eltru.ingreso", teamId: "EQUIPO1234", keyId: "CLAVE12345", privateKey: pem }, ahora);
  const [cabecera, cuerpo, firma] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(cabecera, "base64url").toString()), { alg: "ES256", kid: "CLAVE12345" });
  assert.deepEqual(JSON.parse(Buffer.from(cuerpo, "base64url").toString()),
    { iss: "EQUIPO1234", sub: "co.eltru.ingreso", aud: "https://appleid.apple.com", iat: ahora, exp: ahora + 300 });
  assert.ok(verify("sha256", Buffer.from(cabecera + "." + cuerpo), { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(firma, "base64url")));
});

test("de la respuesta guardada por Keycloak se toma el refresh token de Apple", () => {
  assert.equal(refreshDeRespuesta(JSON.stringify({ access_token: "a", refresh_token: "r.uno", id_token: "i" })), "r.uno");
  assert.equal(refreshDeRespuesta("access_token=a&refresh_token=r.dos&expires_in=3600"), "r.dos");
  assert.equal(refreshDeRespuesta(JSON.stringify({ access_token: "a" })), null);
  assert.equal(refreshDeRespuesta("no es un token"), null);
});
