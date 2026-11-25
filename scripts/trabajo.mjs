// Empieza un issue: reserva la rama, crea el worktree, asigna una ranura de puertos y corre npm ci.
// Uso: npm run trabajo -- <issue> [--sesion <identificador>]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RANURAS = 8;

// Cada base deja ocho puertos seguidos, lejos de los predeterminados (8081, 8080, 3001, 4322, 18081, 18080).
const BASES = { WEB_PORT: 8100, OIDC_PORT: 8200, API_PORT: 3100, METRO_PORT: 8300, APP_WEB_PORT: 8400, TEST_PORT: 4400, TEST_WEB_PORT: 18500, TEST_OIDC_PORT: 18600 };

export function puertos(ranura) {
  if (!Number.isInteger(ranura) || ranura < 1 || ranura > RANURAS) throw new Error(`Ranura fuera de rango: ${ranura}`);
  return Object.fromEntries(Object.entries(BASES).map(([clave, base]) => [clave, base + ranura]));
}

export function contenidoEnv(issue, ranura) {
  const lineas = Object.entries(puertos(ranura)).map(([clave, valor]) => `${clave}=${valor}`);
  return [
    `# Generado por npm run trabajo -- ${issue}. Ranura ${ranura} de ${RANURAS}.`,
    "# check_site.sh, verificar-stack.sh y playwright.config.mjs lo leen sin pisar variables ya definidas.",
    `TRUCO_RANURA=${ranura}`,
    ...lineas,
    `COMPOSE_PROJECT_NAME=truco-issue-${issue}`,
    "",
  ].join("\n");
}

function conBloqueo(registro, accion) {
  const bloqueo = join(registro, ".bloqueo");
  for (let intento = 0; ; intento++) {
    try {
      mkdirSync(bloqueo);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // Un bloqueo de más de un minuto quedó de un proceso interrumpido.
      if (Date.now() - statSync(bloqueo).mtimeMs > 60_000) rmdirSync(bloqueo);
      else if (intento > 100) throw new Error(`El registro de ranuras está bloqueado: ${bloqueo}`);
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return accion();
  } finally {
    rmdirSync(bloqueo);
  }
}

// Una ranura está libre si no tiene registro o si su worktree ya no existe.
export function asignarRanura(registro, worktree) {
  mkdirSync(registro, { recursive: true });
  return conBloqueo(registro, () => {
    for (let ranura = 1; ranura <= RANURAS; ranura++) {
      const archivo = join(registro, String(ranura));
      if (existsSync(archivo)) {
        const ocupante = readFileSync(archivo, "utf8").trim();
        if (ocupante !== worktree && existsSync(ocupante)) continue;
      }
      writeFileSync(archivo, `${worktree}\n`);
      return ranura;
    }
    const ocupadas = readdirSync(registro).filter((nombre) => /^\d+$/.test(nombre))
      .map((nombre) => `  ${nombre}: ${readFileSync(join(registro, nombre), "utf8").trim()}`);
    throw new Error(`No hay ranuras libres. Borrá un worktree terminado o su archivo en ${registro}:\n${ocupadas.join("\n")}`);
  });
}

export function sesionPredeterminada(env = process.env) {
  if (env.CLAUDE_CODE_SESSION_ID) return `claude-${env.CLAUDE_CODE_SESSION_ID.slice(0, 8)}`;
  if (env.CODEX_THREAD_ID) return `codex-${env.CODEX_THREAD_ID.slice(0, 8)}`;
  return `local-${new Date().toISOString().slice(0, 16)}`;
}

function sh(comando, args, opciones = {}) {
  return execFileSync(comando, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opciones }).trim();
}

function principal(argv) {
  const args = [...argv];
  let sesion = sesionPredeterminada();
  const iSesion = args.indexOf("--sesion");
  if (iSesion !== -1) [, sesion] = args.splice(iSesion, 2);
  const [issue] = args;
  if (!/^[1-9]\d*$/.test(issue ?? "") || args.length !== 1 || !sesion) {
    throw new Error("Uso: npm run trabajo -- <issue> [--sesion <identificador>]");
  }

  const raiz = sh("git", ["rev-parse", "--show-toplevel"]);
  const rama = `codex/issue-${issue}`;
  const worktree = resolve(raiz, "..", `truco-issue-${issue}`);
  const rutaRelativa = relative(raiz, worktree);
  if (existsSync(worktree)) throw new Error(`Ya existe ${worktree}. No toqué nada.`);

  sh("git", ["fetch", "--quiet", "origin", "main"], { cwd: raiz });
  const base = sh("git", ["rev-parse", "origin/main"], { cwd: raiz });
  // La creación de la referencia es la reserva: GitHub la rechaza si la rama ya existe.
  const reserva = spawnSync("gh", ["api", "--method", "POST", "repos/{owner}/{repo}/git/refs",
    "-f", `ref=refs/heads/${rama}`, "-f", `sha=${base}`], { cwd: raiz, encoding: "utf8" });
  if (reserva.status !== 0) {
    const detalle = `${reserva.stdout}${reserva.stderr}`.trim();
    throw new Error(`No pude reservar ${rama}. Si la rama ya existe, coordiná con quien la lleva. No toqué nada.\n${detalle}`);
  }
  console.log(`Reservé ${rama} desde ${base.slice(0, 7)}.`);

  sh("git", ["fetch", "--quiet", "origin", `${rama}:refs/remotes/origin/${rama}`], { cwd: raiz });
  sh("git", ["worktree", "add", "--quiet", "--track", "-b", rama, worktree, `origin/${rama}`], { cwd: raiz });

  const registro = process.env.TRUCO_RANURAS ?? join(homedir(), ".cache", "truco", "ranuras");
  const ranura = asignarRanura(registro, worktree);
  writeFileSync(join(worktree, ".env.trabajo"), contenidoEnv(issue, ranura));
  // Compose solo interpola .env: el enlace hace que docker compose use los puertos y el proyecto de la ranura.
  if (!existsSync(join(worktree, ".env"))) symlinkSync(".env.trabajo", join(worktree, ".env"));
  const p = puertos(ranura);
  console.log(`Ranura ${ranura}: web ${p.WEB_PORT}, identidad ${p.OIDC_PORT}, API ${p.API_PORT}, Metro ${p.METRO_PORT}, Playwright ${p.TEST_PORT}, check:stack ${p.TEST_WEB_PORT} y ${p.TEST_OIDC_PORT}.`);

  const comentario = [
    `Reservé \`${rama}\` desde \`main\` (${base.slice(0, 7)}) con \`npm run trabajo\`.`,
    "",
    `- Sesión: \`${sesion}\``,
    `- Worktree: \`${rutaRelativa}\``,
    `- Ranura ${ranura}: web ${p.WEB_PORT}, identidad ${p.OIDC_PORT}, API ${p.API_PORT}, Playwright ${p.TEST_PORT}, \`check:stack\` ${p.TEST_WEB_PORT}/${p.TEST_OIDC_PORT}, Metro ${p.METRO_PORT}, proyecto Compose \`truco-issue-${issue}\`.`,
  ].join("\n");
  const aviso = spawnSync("gh", ["issue", "comment", issue, "--body", comentario], { cwd: raiz, encoding: "utf8" });
  if (aviso.status !== 0) console.warn(`No pude comentar en el issue #${issue}: ${aviso.stderr.trim()}`);

  const instalacion = spawnSync("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: worktree, stdio: "inherit" });
  if (instalacion.status !== 0) throw new Error(`npm ci falló en ${worktree}. La rama y el worktree quedan reservados.`);
  console.log(`Listo: cd ${rutaRelativa}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    principal(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
