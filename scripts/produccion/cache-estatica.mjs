import assert from "node:assert/strict";

const origin = process.env.WEB_ORIGIN;
const cacheLarga = "public, max-age=31536000, immutable";

async function visitar(path, status, headers) {
  const response = await fetch(new URL(path, origin), {
    headers, signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, path);
  return response;
}

const portada = await visitar("/", 200);
assert.doesNotMatch(portada.headers.get("cache-control") ?? "", /immutable/);
const imagen = (await portada.text()).match(/src="(\/_astro\/mesa-criolla\.[^"]+\.webp)"/)?.[1];
assert.ok(imagen, "La portada tiene una imagen principal versionada");

const recurso = await visitar(imagen, 200);
assert.equal(recurso.headers.get("cache-control"), cacheLarga, imagen);
const etag = recurso.headers.get("etag");
assert.ok(etag, imagen);
await recurso.body.cancel();
const validado = await visitar(imagen, 304, {"if-none-match": etag});
assert.equal(validado.headers.get("cache-control"), cacheLarga, imagen);

for (const [path, status] of [["/jugar/", 200], ["/favicon.svg", 200], ["/_astro/no-existe.js", 404]]) {
  const response = await visitar(path, status);
  assert.doesNotMatch(response.headers.get("cache-control") ?? "", /immutable/, path);
  await response.body?.cancel();
}
const sesion = await visitar("/api/jugador", 401);
assert.equal(sesion.headers.get("cache-control"), "no-store");
await sesion.body.cancel();
console.log("Caché de recursos versionados, HTML y sesión: OK");
