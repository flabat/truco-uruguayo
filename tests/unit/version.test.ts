import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { esLanzamiento, leerVersionServidor, textoDeVersion, versionDesdeEntorno } from "@eltruco/cliente/version.ts";
import { crearVersion, rutaVersion } from "../../api/version.ts";
import { variablesDeVersion } from "../../scripts/version.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const entorno = {
  TRUCO_RELEASE: commit, TRUCO_RAMA: "codex/issue-382", TRUCO_FECHA: "2026-11-25T12:00:00.000Z",
  TRUCO_SUCIO: "1", TRUCO_ETIQUETA: "",
};

test("la versión se lee de las variables grabadas en la imagen", () => {
  assert.deepEqual(versionDesdeEntorno(entorno), {
    rama: "codex/issue-382", commit, fecha: "2026-11-25T12:00:00.000Z", sucio: true, etiqueta: null,
  });
  assert.deepEqual(versionDesdeEntorno({}), { rama: null, commit: null, fecha: null, sucio: false, etiqueta: null });
  // Valores que no salen de git o de la fecha del build se descartan.
  const raros = versionDesdeEntorno({ TRUCO_RELEASE: "abc", TRUCO_RAMA: "<script>", TRUCO_FECHA: "ayer", TRUCO_SUCIO: "si" });
  assert.deepEqual(raros, { rama: null, commit: null, fecha: null, sucio: false, etiqueta: null });
});

test("el pie muestra rama y commit corto, y se oculta en los lanzamientos", () => {
  assert.equal(textoDeVersion(versionDesdeEntorno(entorno)), "codex/issue-382 · 01234567-sucio");
  assert.equal(textoDeVersion(versionDesdeEntorno({ ...entorno, TRUCO_SUCIO: "0" })), "codex/issue-382 · 01234567");
  // Un checkout desacoplado no tiene rama.
  assert.equal(textoDeVersion(versionDesdeEntorno({ ...entorno, TRUCO_RAMA: "" })), "01234567-sucio");
  const lanzamiento = versionDesdeEntorno({ ...entorno, TRUCO_SUCIO: "0", TRUCO_ETIQUETA: "v1.0.0" });
  assert.ok(esLanzamiento(lanzamiento));
  assert.equal(textoDeVersion(lanzamiento), null);
  // Una etiqueta con cambios sin commit no es el lanzamiento: el pie lo avisa.
  assert.equal(textoDeVersion(versionDesdeEntorno({ ...entorno, TRUCO_ETIQUETA: "v1.0.0" })), "codex/issue-382 · 01234567-sucio");
  assert.equal(textoDeVersion(versionDesdeEntorno({})), null);
});

test("el cliente valida la respuesta de /api/version", () => {
  const respuesta = { rama: "main", commit, fecha: "2026-11-25T12:00:00.000Z", sucio: false, etiqueta: null };
  assert.deepEqual(leerVersionServidor(respuesta), respuesta);
  assert.equal(leerVersionServidor(null), null);
  assert.equal(leerVersionServidor("main"), null);
  assert.deepEqual(leerVersionServidor({ commit: 42, sucio: "true" }),
    { rama: null, commit: null, fecha: null, sucio: false, etiqueta: null });
});

async function servir(entornoApi: Record<string, string>) {
  const version = crearVersion(entornoApi);
  const server: Server = createServer((req, res) => version(req.method, res));
  await new Promise<void>(listo => server.listen(0, "127.0.0.1", listo));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}${rutaVersion}`, cerrar: () => new Promise(fin => server.close(fin)) };
}

test("GET /api/version responde la versión sin caché y rechaza otros métodos", async () => {
  const { url, cerrar } = await servir(entorno);
  try {
    const respuesta = await fetch(url);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("cache-control"), "no-store");
    assert.match(respuesta.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await respuesta.json(), versionDesdeEntorno(entorno));
    const post = await fetch(url, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
  } finally {
    await cerrar();
  }
});

test("scripts/version.mjs toma rama, commit, cambios sin commit y etiqueta del checkout", t => {
  const dir = mkdtempSync(join(tmpdir(), "truco-version-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "prueba/rama");
  git("-c", "user.name=Prueba", "-c", "user.email=prueba@example.invalid", "commit", "-q", "--allow-empty", "-m", "inicio");
  const ahora = new Date("2026-11-25T12:00:00.000Z");

  const limpio = variablesDeVersion(dir, ahora);
  assert.deepEqual(limpio, {
    TRUCO_RELEASE: git("rev-parse", "HEAD"), TRUCO_RAMA: "prueba/rama", TRUCO_FECHA: "2026-11-25T12:00:00.000Z",
    TRUCO_SUCIO: "0", TRUCO_ETIQUETA: "",
  });

  writeFileSync(join(dir, "nuevo.txt"), "sin commit");
  assert.equal(variablesDeVersion(dir, ahora).TRUCO_SUCIO, "1");
  rmSync(join(dir, "nuevo.txt"));

  git("tag", "v1.0.0");
  const etiquetado = variablesDeVersion(dir, ahora);
  assert.equal(etiquetado.TRUCO_ETIQUETA, "v1.0.0");
  assert.equal(textoDeVersion(versionDesdeEntorno(etiquetado)), null);

  git("checkout", "-q", "--detach");
  assert.equal(variablesDeVersion(dir, ahora).TRUCO_RAMA, "");
  const fuera = mkdtempSync(join(tmpdir(), "truco-sin-git-"));
  t.after(() => rmSync(fuera, { recursive: true, force: true }));
  assert.throws(() => variablesDeVersion(fuera), /no es un checkout/);
});
