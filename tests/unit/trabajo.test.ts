import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asignarRanura, contenidoEnv, puertos, RANURAS } from "../../scripts/trabajo.mjs";

const script = join(import.meta.dirname, "../../scripts/trabajo.mjs");
const entorno = join(import.meta.dirname, "../../scripts/trabajo-entorno.sh");
const temporal = () => mkdtempSync(join(tmpdir(), "truco-trabajo-"));

test("cada ranura usa puertos propios, distintos de los predeterminados", () => {
  const usados = new Set([8081, 8080, 3001, 4322, 18081, 18080]);
  for (let ranura = 1; ranura <= RANURAS; ranura++) {
    for (const puerto of Object.values(puertos(ranura))) {
      assert.ok(!usados.has(puerto), `puerto repetido: ${puerto}`);
      usados.add(puerto);
    }
  }
  assert.throws(() => puertos(0));
  assert.throws(() => puertos(RANURAS + 1));
});

test(".env.trabajo trae los puertos de la ranura y el proyecto Compose del issue", () => {
  const env = contenidoEnv("42", 3);
  for (const linea of ["WEB_PORT=8103", "OIDC_PORT=8203", "API_PORT=3103", "METRO_PORT=8303", "APP_WEB_PORT=8403", "TEST_PORT=4403",
    "TEST_WEB_PORT=18503", "TEST_OIDC_PORT=18603", "COMPOSE_PROJECT_NAME=truco-issue-42"]) {
    assert.match(env, new RegExp(`^${linea}$`, "m"));
  }
});

test("asigna la primera ranura libre y recupera la de un worktree borrado", () => {
  const raiz = temporal();
  const registro = join(raiz, "ranuras");
  const worktree = (n: number) => { const ruta = join(raiz, `wt-${n}`); mkdirSync(ruta, { recursive: true }); return ruta; };
  assert.equal(asignarRanura(registro, worktree(1)), 1);
  assert.equal(asignarRanura(registro, worktree(2)), 2);
  assert.equal(asignarRanura(registro, join(raiz, "wt-1")), 1, "el mismo worktree conserva su ranura");
  assert.equal(asignarRanura(registro, join(raiz, "borrado")), 3);
  // El worktree de la ranura 3 nunca existió: la ranura queda libre para el siguiente.
  assert.equal(asignarRanura(registro, worktree(4)), 3);
  assert.equal(readFileSync(join(registro, "3"), "utf8").trim(), join(raiz, "wt-4"));
  assert.ok(!existsSync(join(registro, ".bloqueo")));
});

test("falla sin ranuras libres y nombra a los ocupantes", () => {
  const raiz = temporal();
  const registro = join(raiz, "ranuras");
  for (let n = 1; n <= RANURAS; n++) {
    const ruta = join(raiz, `wt-${n}`);
    mkdirSync(ruta);
    asignarRanura(registro, ruta);
  }
  const extra = join(raiz, "extra");
  mkdirSync(extra);
  assert.throws(() => asignarRanura(registro, extra), /No hay ranuras libres[\s\S]*wt-8/);
  assert.ok(!existsSync(join(registro, ".bloqueo")));
});

test("trabajo-entorno.sh exporta la ranura sin pisar variables definidas y no hace nada sin archivo", () => {
  const dir = temporal();
  const leer = (env: Record<string, string>) => execFileSync("bash", ["-c",
    `set -euo pipefail; source ${JSON.stringify(entorno)}; echo "\${TEST_PORT:-}|\${TEST_WEB_PORT:-}"`],
  { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } }).trim();
  assert.equal(leer({}), "|");
  writeFileSync(join(dir, ".env.trabajo"), contenidoEnv("42", 2));
  assert.equal(leer({}), "4402|18502");
  assert.equal(leer({ TEST_PORT: "4331" }), "4331|18502");
});

test("si la rama ya existe, el comando falla sin crear worktree ni ranura", () => {
  const raiz = temporal();
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
  const origen = join(raiz, "origen.git");
  const checkout = join(raiz, "checkout");
  git(raiz, "init", "--quiet", "--bare", "-b", "main", origen);
  git(raiz, "init", "--quiet", "-b", "main", checkout);
  git(checkout, "-c", "user.name=prueba", "-c", "user.email=prueba@example.org", "commit", "--quiet", "--allow-empty", "-m", "inicio");
  git(checkout, "remote", "add", "origin", origen);
  git(checkout, "push", "--quiet", "origin", "main");
  // GitHub responde 422 cuando la referencia ya existe.
  const bin = join(raiz, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/bin/sh\necho 'Reference already exists (HTTP 422)' >&2\nexit 1\n");
  chmodSync(join(bin, "gh"), 0o755);
  const registro = join(raiz, "ranuras");
  const corrida = spawnSync(process.execPath, [script, "42"], {
    cwd: checkout, encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRUCO_RANURAS: registro },
  });
  assert.equal(corrida.status, 1);
  assert.match(corrida.stderr, /No pude reservar codex\/issue-42[\s\S]*Reference already exists/);
  assert.ok(!existsSync(join(raiz, "truco-issue-42")));
  assert.ok(!existsSync(registro));
  assert.equal(execFileSync("git", ["branch", "--list", "codex/*"], { cwd: checkout, encoding: "utf8" }), "");
});

test("rechaza argumentos inválidos y un worktree que ya existe", () => {
  assert.match(spawnSync(process.execPath, [script, "abc"], { encoding: "utf8" }).stderr, /Uso: npm run trabajo/);
  const raiz = temporal();
  const checkout = join(raiz, "checkout");
  execFileSync("git", ["init", "--quiet", checkout]);
  mkdirSync(join(raiz, "truco-issue-7"));
  const corrida = spawnSync(process.execPath, [script, "7"], { cwd: checkout, encoding: "utf8" });
  assert.equal(corrida.status, 1);
  assert.match(corrida.stderr, /Ya existe .*truco-issue-7\. No toqué nada\./);
});
