import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("el rápido ejecuta en la cola solo los planes amplios y --plan nunca toma puesto", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "truco-rapido-cola-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const registro = join(tmp, "etapas");
  const cola = join(tmp, "cola");
  const env = {
    ...process.env, PATH: `${tmp}:${process.env.PATH}`, REGISTRO: registro, TRUCO_COLA_DIR: cola,
    PYTHON_REAL: execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim(),
  };
  // Las etapas anotan el puesto y salen sin correr nada. Solo la cola usa Python de verdad.
  const anotar = 'echo "${TRUCO_COLA_PUESTO:-libre} $*" >> "$REGISTRO"\n';
  writeFileSync(join(tmp, "python3"), '#!/bin/sh\nif [ "$1" = scripts/cola-pila.py ]; then exec "$PYTHON_REAL" "$@"; fi\n' + anotar, { mode: 0o755 });
  for (const nombre of ["npm", "node"]) writeFileSync(join(tmp, nombre), "#!/bin/sh\n" + anotar, { mode: 0o755 });
  function probar(archivo: string, ...args: string[]) {
    rmSync(registro, { force: true });
    const entorno: NodeJS.ProcessEnv = { ...env, CHECK_RAPIDO_ARCHIVOS: archivo };
    delete entorno.TRUCO_COLA_PUESTO;
    return execFileSync(process.execPath, ["scripts/check-rapido.mjs", "--base", "HEAD", ...args], {
      env: entorno, timeout: 30_000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  }
  function etapas() {
    return readFileSync(registro, "utf8").trim().split("\n");
  }

  const global = "package.json";
  assert.match(probar(global, "--plan"), /usa la cola/);
  assert.equal(existsSync(cola), false);
  assert.equal(existsSync(registro), false);

  probar("public/recurso-de-prueba.sin-import");
  assert.ok(etapas().every((etapa) => etapa.startsWith("0 ")));
  assert.ok(etapas().includes("0 exec -- playwright test"));
  assert.ok(!etapas().includes("0 run test:unit"));

  probar(global);
  assert.ok(etapas().includes("0 run test:unit"));
  assert.ok(etapas().includes("0 exec -- playwright test"));
  assert.ok(etapas().every((etapa) => etapa.startsWith("0 ") && !etapa.includes("check:stack")));

  probar(["docs", "cambio-aislado.md"].join("/"));
  assert.deepEqual(etapas(), ["libre run cartas:verificar"]);
});
