#!/usr/bin/env node
// Verificación rápida y sin Docker de lo que cambió respecto de origin/main.
//
// Corre las pruebas que alcanzan los archivos cambiados: las unitarias cuyo árbol de
// imports incluye un archivo cambiado, los tipos de la app si cambió app/ o paquetes/,
// las pruebas de despliegue si cambió Python o infra/ y las pruebas de Playwright de las
// rutas afectadas. No reemplaza `npm run check` ni `CHECK_STACK=1 npm run check`.
//
// Uso: npm run check:rapido [-- --plan] [-- --base <ref>]
//   --plan       muestra qué correría y por qué, sin correr nada.
//   --base <ref> compara contra otra referencia (por defecto, el merge-base con origin/main).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const raiz = join(dirname(new URL(import.meta.url).pathname), "..");
process.chdir(raiz);

const args = process.argv.slice(2);
const soloPlan = args.includes("--plan");
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const lineas = (texto) => texto.split("\n").filter(Boolean);

function base() {
  const i = args.indexOf("--base");
  if (i >= 0) return args[i + 1];
  for (const ref of ["origin/main", "main"]) {
    try {
      return git("merge-base", ref, "HEAD");
    } catch {}
  }
  throw new Error("No encontré origin/main ni main para comparar.");
}

const desde = base();
// Diferencia contra el árbol de trabajo: incluye commits, cambios sin commit y archivos nuevos.
// CHECK_RAPIDO_ARCHIVOS (separados por comas) reemplaza la lista para probar el plan.
const cambiados = new Set(
  process.env.CHECK_RAPIDO_ARCHIVOS
    ? process.env.CHECK_RAPIDO_ARCHIVOS.split(",").filter(Boolean)
    : [...lineas(git("diff", "--name-only", desde)), ...lineas(git("ls-files", "--others", "--exclude-standard"))],
);

// Archivos que cambian el resultado de todo: con ellos corre la verificación completa sin Docker.
const globales = [
  "package.json",
  "package-lock.json",
  "astro.config.mjs",
  "playwright.config.mjs",
  ".nvmrc",
  "scripts/check-rapido.mjs",
];

// --- Grafo de imports ----------------------------------------------------------------
const extensiones = /\.(ts|tsx|mts|js|jsx|mjs|astro)$/;
const fuentes = lineas(git("ls-files", "--cached", "--others", "--exclude-standard"))
  .filter((f) => extensiones.test(f) && !f.startsWith("video/") && existsSync(f));

const patrones = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

function resolver(desdeArchivo, especificador) {
  const limpio = especificador.split("?")[0];
  let ruta;
  if (limpio.startsWith(".")) ruta = normalize(join(dirname(desdeArchivo), limpio));
  else if (limpio.startsWith("@eltruco/")) {
    const [, paquete, ...resto] = limpio.split("/");
    ruta = join("paquetes", paquete, "src", resto.length ? resto.join("/") : "index.ts");
  } else return null;
  for (const candidato of [ruta, `${ruta}.ts`, `${ruta}.tsx`, `${ruta}.mjs`, `${ruta}.js`, join(ruta, "index.ts")]) {
    if (existsSync(candidato) && statSync(candidato).isFile()) return candidato;
  }
  return ruta; // Un import roto o borrado igual cuenta: la prueba que lo usa tiene que correr.
}

const imports = new Map();
function importsDe(archivo) {
  if (imports.has(archivo)) return imports.get(archivo);
  const salida = new Set();
  imports.set(archivo, salida);
  if (!extensiones.test(archivo) || !existsSync(archivo)) return salida;
  const texto = readFileSync(archivo, "utf8");
  for (const patron of patrones) {
    for (const [, especificador] of texto.matchAll(patron)) {
      const destino = resolver(archivo, especificador);
      if (destino) salida.add(destino);
    }
  }
  return salida;
}

const clausuras = new Map();
function clausura(archivo) {
  if (clausuras.has(archivo)) return clausuras.get(archivo);
  const vistos = new Set([archivo]);
  const pendientes = [archivo];
  while (pendientes.length) {
    for (const destino of importsDe(pendientes.pop())) {
      if (!vistos.has(destino)) {
        vistos.add(destino);
        pendientes.push(destino);
      }
    }
  }
  clausuras.set(archivo, vistos);
  return vistos;
}

// Un archivo cuenta como alcanzado si está en su árbol de imports o si lo nombra por su
// ruta (pruebas que leen configuraciones, Dockerfiles o datos con readFileSync).
function alcanzados(archivo) {
  const propios = [...cambiados].filter((c) => clausura(archivo).has(c));
  const texto = readFileSync(archivo, "utf8");
  for (const c of cambiados) if (!propios.includes(c) && texto.includes(c)) propios.push(c);
  return propios;
}

// --- Plan -----------------------------------------------------------------------------
const plan = [];
const motivos = [];
const todoGlobal = [...cambiados].filter((c) => globales.includes(c));

const unitarias = fuentes.filter((f) => /^(tests\/unit\/[^/]+|paquetes\/[^/]+\/test\/[^/]+)\.test\.ts$/.test(f));
const specs = fuentes.filter((f) => /^tests\/[^/]+\.spec\.mjs$/.test(f));

let unitariasElegidas;
let specsElegidas;
if (todoGlobal.length) {
  motivos.push(`cambió ${todoGlobal.join(", ")}: corren todas las pruebas sin Docker`);
  unitariasElegidas = unitarias;
  specsElegidas = specs;
} else {
  unitariasElegidas = unitarias.filter((u) => alcanzados(u).length);

  // Rutas del sitio: cada página con su árbol de imports y la ruta que visitan las pruebas.
  const paginas = fuentes
    .filter((f) => f.startsWith("src/pages/"))
    .map((archivo) => {
      const partes = relative("src/pages", archivo).replace(extensiones, "").split("/");
      const dinamica = partes.findIndex((p) => p.startsWith("["));
      const fijas = dinamica >= 0 ? partes.slice(0, dinamica) : partes.filter((p) => p !== "index");
      return { archivo, ruta: fijas.length ? `${fijas.join("/")}/` : "" };
    });
  const paginasAfectadas = paginas.filter((p) => alcanzados(p.archivo).length);
  const usadosPorAlgo = (c) =>
    paginas.some((p) => clausura(p.archivo).has(c)) ||
    [...unitarias, ...specs].some((f) => clausura(f).has(c));
  // Lo que el sitio carga sin import (public/, colecciones, estilos sueltos) no tiene ruta
  // conocida: por las dudas corren todas las pruebas de navegador.
  const sinRuta = [...cambiados].filter(
    (c) => (c.startsWith("src/") || c.startsWith("public/")) && !usadosPorAlgo(c),
  );
  if (sinRuta.length) {
    motivos.push(`sin ruta conocida para ${sinRuta.slice(0, 3).join(", ")}${sinRuta.length > 3 ? "…" : ""}: corren todas las pruebas de navegador`);
    specsElegidas = specs;
  } else {
    const visita = (texto, ruta) =>
      ruta === ""
        ? /goto\(\s*["'`]\.?\/["'`]/.test(texto)
        : [`"${ruta}`, `'${ruta}`, `"/${ruta}`, `'/${ruta}`].some((p) => texto.includes(p));
    specsElegidas = specs.filter((s) => {
      if (alcanzados(s).length) return true;
      const texto = readFileSync(s, "utf8");
      return paginasAfectadas.some((p) => visita(texto, p.ruta));
    });
    if (paginasAfectadas.length) motivos.push(`rutas afectadas: ${paginasAfectadas.map((p) => `/${p.ruta}`).filter((r, i, a) => a.indexOf(r) === i).join(" ")}`);
  }
}

const tocaApp = todoGlobal.length || [...cambiados].some((c) => c.startsWith("app/") || c.startsWith("paquetes/"));
const tocaDespliegue = todoGlobal.length || [...cambiados].some((c) => c.endsWith(".py") || c.startsWith("infra/") || c.startsWith("tests/despliegue/"));

plan.push(["cartas", ["npm", "run", "cartas:verificar"]]);
if (unitariasElegidas.length === unitarias.length) plan.push(["todas las unitarias", ["npm", "run", "test:unit"]]);
else if (unitariasElegidas.length) {
  const concurrencia = process.env.TEST_CONCURRENCY ? [`--test-concurrency=${process.env.TEST_CONCURRENCY}`] : [];
  plan.push([`${unitariasElegidas.length} de ${unitarias.length} archivos de unitarias`, ["node", "--test", ...concurrencia, ...unitariasElegidas]]);
}
if (tocaApp) plan.push(["tipos de la app", ["npm", "run", "app:tipos"]]);
if (tocaDespliegue) plan.push(["pruebas de despliegue", ["python3", "-B", "-m", "unittest", "discover", "-s", "tests/despliegue"]]);
if (specsElegidas.length) {
  plan.push(["build", ["npm", "run", "build"]]);
  plan.push(["enlaces", ["python3", ".github/scripts/check_links.py", "dist", "https://example.org/"]]);
  plan.push(["cartas del sitio", ["python3", ".github/scripts/check_cards.py", "dist"]]);
  const filtro = specsElegidas.length === specs.length ? [] : specsElegidas;
  plan.push([`${specsElegidas.length} de ${specs.length} archivos de Playwright`, ["npm", "exec", "--", "playwright", "test", ...filtro]]);
}

console.log(`check:rapido contra ${desde.slice(0, 7)}: ${cambiados.size} archivos cambiados.`);
for (const m of motivos) console.log(`  · ${m}`);
const resumir = (comando) => {
  const archivos = comando.filter((p) => /\.(test\.ts|spec\.mjs)$/.test(p));
  if (archivos.length <= 6) return comando.join(" ");
  const resto = comando.filter((p) => !archivos.includes(p));
  return `${resto.join(" ")} ${archivos.slice(0, 4).join(" ")} … (+${archivos.length - 4})`;
};
for (const [nombre, comando] of plan) console.log(`  → ${nombre}: ${resumir(comando)}`);
if ([...cambiados].some((c) => c.startsWith("api/") || c.startsWith("infra/") || c.startsWith("scripts/verificar"))) {
  console.log("  ! El cambio toca la API, la infraestructura o la pila: antes del PR corré CHECK_STACK=1 npm run check.");
}
if (soloPlan) process.exit(0);

const inicio = Date.now();
for (const [nombre, [comando, ...resto]] of plan) {
  const t = Date.now();
  const r = spawnSync(comando, resto, { stdio: "inherit" });
  const segundos = Math.round((Date.now() - t) / 1000);
  if (r.status !== 0) {
    console.error(`✗ ${nombre} falló tras ${segundos} s.`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ ${nombre} (${segundos} s)`);
}
console.log(`check:rapido terminó en ${Math.round((Date.now() - inicio) / 1000)} s.`);
