// Comprueba que el servidor entrega la asociación con la app como la piden iOS y Android:
// 200 directo (sin redirecciones), application/json y los datos de APPLE_TEAM_ID y ANDROID_CERT_SHA256.
//   node scripts/verificar-enlaces-app.mjs <origen>
import assert from "node:assert/strict";
import { asociacionApple, vinculosAndroid } from "./enlaces-app.mjs";

const origen = process.argv[2];
assert.ok(origen, "Uso: verificar-enlaces-app.mjs <origen>");
const esperados = {
  "/.well-known/apple-app-site-association": asociacionApple(process.env.APPLE_TEAM_ID),
  "/.well-known/assetlinks.json": vinculosAndroid(process.env.ANDROID_CERT_SHA256),
};
for (const [ruta, esperado] of Object.entries(esperados)) {
  assert.ok(esperado, "Definí APPLE_TEAM_ID y ANDROID_CERT_SHA256 para verificar " + ruta);
  const respuesta = await fetch(new URL(ruta, origen), { redirect: "manual", signal: AbortSignal.timeout(10000) });
  assert.equal(respuesta.status, 200, ruta);
  assert.match(respuesta.headers.get("content-type") ?? "", /^application\/json\b/, ruta);
  assert.deepEqual(await respuesta.json(), esperado, ruta);
}
console.log(`Asociación con la app en ${origen}: OK`);
