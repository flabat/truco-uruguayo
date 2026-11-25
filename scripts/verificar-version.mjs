// Desde el host, contra la web del stack descartable construido con `node scripts/version.mjs --exportar`:
// GET /api/version publica la versión grabada en la imagen y el pie la muestra en la web y en la app.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { textoDeVersion, versionDesdeEntorno } from "../paquetes/cliente/src/version.ts";

const web = process.argv[2];
const esperada = versionDesdeEntorno(process.env);
assert.ok(esperada.commit, "el stack se construye con TRUCO_RELEASE");

const respuesta = await fetch(new URL("/api/version", web), { cache: "no-store" });
assert.equal(respuesta.status, 200);
assert.equal(respuesta.headers.get("cache-control"), "no-store");
assert.deepEqual(await respuesta.json(), esperada, "la API publica la versión del build");

const texto = textoDeVersion(esperada);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL: web });
  await page.goto("/");
  const servidor = page.getByRole("contentinfo").getByText("Servidor", { exact: true });
  if (texto) await expect(servidor.locator("+ dd")).toHaveText(texto);
  else await expect(servidor).toBeHidden();

  await page.goto("/app/");
  const pie = page.getByTestId("pie-version");
  if (texto) await expect(pie).toHaveText(texto, { timeout: 20_000 });
  else await expect(pie).toHaveCount(0);
} finally {
  await browser.close();
}
console.log("Versión del servidor:", texto ?? "lanzamiento sin pie");
