import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { NotificacionInvalida, crearClavesApple, verificarNotificacion, type ClavesApple } from "../../api/notificaciones-apple.ts";

// Claves generadas en la prueba: «apple» publica la suya en un JWKS local, «ajena» no.
const apple = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ajena = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (clave: KeyObject, kid: string) => ({ ...clave.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" });
const parte = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString("base64url");
const ahora = 1_800_000_000;
const evento = { type: "consent-revoked", sub: "001.abc.0001", event_time: 1_795_000_000_000 };
const esperado = { tipo: "consent-revoked", sub: "001.abc.0001", momento: "1795000000000" };

function claims(cambios: Record<string, unknown> = {}) {
  return { iss: "https://appleid.apple.com", aud: "co.eltru.ingreso", iat: ahora - 60, jti: "aviso-1", events: JSON.stringify(evento), ...cambios };
}

function firmar(cuerpo: object, { kid = "apple-1", alg = "RS256", clave = apple.privateKey } = {}) {
  const datos = parte({ kid, alg }) + "." + parte(cuerpo);
  return datos + "." + sign("sha256", Buffer.from(datos), clave).toString("base64url");
}

async function servirClaves(claves: object[]) {
  const estado = { pedidos: 0, claves };
  const servidor = createServer((_, res) => {
    estado.pedidos++;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: estado.claves }));
  }).listen(0, "127.0.0.1");
  await once(servidor, "listening");
  return { estado, servidor, url: `http://127.0.0.1:${(servidor.address() as { port: number }).port}/auth/keys` };
}

let jwks: Awaited<ReturnType<typeof servirClaves>>;
let claves: ClavesApple;
before(async () => {
  jwks = await servirClaves([jwk(apple.publicKey, "apple-1")]);
  claves = crearClavesApple(jwks.url);
});
after(() => jwks.servidor.close());

const verificar = (jws: string, conClaves = claves) =>
  verificarNotificacion(jws, { claves: conClaves, audiencias: ["co.eltru.ingreso", "co.eltru.app"], ahora });
const invalida = (jws: string, conClaves = claves) => assert.rejects(verificar(jws, conClaves), NotificacionInvalida);

test("una notificación firmada por Apple entrega su evento", async () => {
  assert.deepEqual(await verificar(firmar(claims())), esperado);
  assert.deepEqual(await verificar(firmar(claims({ aud: ["co.eltru.app"] }))), esperado, "aud también llega como lista");
  assert.deepEqual(await verificar(firmar(claims({ events: evento }))), esperado, "events también llega como objeto");
});

test("se rechaza una firma ajena o un cuerpo alterado", async () => {
  await invalida(firmar(claims(), { clave: ajena.privateKey }));
  const [cabecera, , firma] = firmar(claims()).split(".");
  await invalida([cabecera, parte(claims({ events: JSON.stringify({ ...evento, sub: "001.otro.0002" }) })), firma].join("."));
});

test("se rechaza otro emisor u otro destinatario", async () => {
  await invalida(firmar(claims({ iss: "https://appleid.apple.com.otro" })));
  await invalida(firmar(claims({ aud: "otra.app" })));
  await invalida(firmar(claims({ aud: ["otra.app"] })));
});

test("se rechaza una notificación vieja, del futuro o sin iat", async () => {
  await invalida(firmar(claims({ iat: ahora - 86_400 - 1 })));
  await invalida(firmar(claims({ iat: ahora + 301 })));
  await invalida(firmar(claims({ iat: undefined })));
  await invalida(firmar(claims({ iat: String(ahora) })));
  await invalida(firmar(claims({ exp: ahora - 301 })));
  assert.deepEqual(await verificar(firmar(claims({ iat: ahora - 86_400 + 10 }))), esperado);
});

test("solo vale RS256 con una clave publicada por Apple", async () => {
  const sinFirma = parte({ kid: "apple-1", alg: "none" }) + "." + parte(claims()) + ".";
  await invalida(sinFirma);
  // HS256 con la clave pública como secreto: la confusión clásica de algoritmos.
  const datos = parte({ kid: "apple-1", alg: "HS256" }) + "." + parte(claims());
  const publica = apple.publicKey.export({ type: "spki", format: "pem" });
  await invalida(datos + "." + createHmac("sha256", publica).update(datos).digest("base64url"));
  await invalida(firmar(claims(), { kid: "desconocida" }));
  await invalida("no es un jws");
  await invalida("a.b");
});

test("se rechazan eventos mal formados", async () => {
  const sin = (campo: keyof typeof evento) => JSON.stringify({ ...evento, [campo]: undefined });
  for (const events of ["{no es json", sin("type"), sin("sub"), sin("event_time"), undefined]) {
    await invalida(firmar(claims({ events })));
  }
});

test("las claves se bajan una vez y se vuelven a pedir ante un kid nuevo", async () => {
  const propio = await servirClaves([jwk(apple.publicKey, "apple-1")]);
  try {
    const rotadas = crearClavesApple(propio.url, { pausaMs: 0 });
    await verificar(firmar(claims()), rotadas);
    await verificar(firmar(claims()), rotadas);
    assert.equal(propio.estado.pedidos, 1);
    const nueva = generateKeyPairSync("rsa", { modulusLength: 2048 });
    propio.estado.claves.push(jwk(nueva.publicKey, "apple-2"));
    assert.deepEqual(await verificar(firmar(claims(), { kid: "apple-2", clave: nueva.privateKey }), rotadas), esperado);
    assert.equal(propio.estado.pedidos, 2);

    // Con la pausa predeterminada, un kid desconocido recién bajadas las claves no provoca otro pedido.
    const enPausa = crearClavesApple(propio.url);
    await verificar(firmar(claims()), enPausa);
    const antes = propio.estado.pedidos;
    await invalida(firmar(claims(), { kid: "inventada" }), enPausa);
    assert.equal(propio.estado.pedidos, antes);
  } finally {
    propio.servidor.close();
  }
});

test("si Apple no responde se usan las claves ya bajadas; sin ellas la notificación no se rechaza", async () => {
  const propio = await servirClaves([jwk(apple.publicKey, "apple-1")]);
  const vencidas = crearClavesApple(propio.url, { vigenciaMs: 0 });
  await verificar(firmar(claims()), vencidas);
  propio.servidor.close();
  await once(propio.servidor as Server, "close");
  assert.deepEqual(await verificar(firmar(claims()), vencidas), esperado);

  const sinClaves = crearClavesApple("http://127.0.0.1:9/auth/keys", { esperaMs: 500 });
  await assert.rejects(verificar(firmar(claims()), sinClaves), error => !(error instanceof NotificacionInvalida));
});
