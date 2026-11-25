// Desde el host, contra la pila descartable de verificar-stack: cuatro personas en una mesa de parejas de la
// app (/app/), con lo que cubría la pantalla Astro que retira #412 (#403):
// - el ingreso por invitación cuenta `ingreso-mesa` sin el token y no muestra el aviso de la comunidad;
// - ninguna página tiene en el DOM ni en /partida las cartas de otro jugador;
// - la hoja «Más» muestra la versión de reglas y el modelo que trae la mesa;
// - «Reportar esta jugada» aparece solo con permiso y envía el reporte;
// - al parar la API y la base, cada mesa dice «Reconectando…» y vuelve a la misma partida;
// - dos «Quiero» tocados a la vez desde la mesa: uno solo prospera.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import { nombrar } from "@eltruco/cliente/textos.ts";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const [web, proyecto] = process.argv.slice(2);
assert.ok(/^truco-check-\d+-\d+$/.test(proyecto ?? ""), "El reinicio requiere el proyecto desechable de verificar-stack.");
const compose = (...args) => promisify(execFile)("docker", ["compose", "--project-name", proyecto, ...args]);
const sql = consulta => compose("exec", "-T", "db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "truco", "-d", "truco", "-Atc", consulta);
const browser = await chromium.launch();
const espera = { timeout: 25_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });

async function pagina() {
  const context = await browser.newContext({ baseURL: web, viewport: { width: 375, height: 760 } });
  const p = await context.newPage();
  p.setDefaultTimeout(25_000);
  // Los conteos de /eventos/ que pide la página, con su dirección completa.
  p.eventos = [];
  p.on("request", r => { if (new URL(r.url()).pathname.startsWith("/eventos/")) p.eventos.push(r.url()); });
  return p;
}

async function api(p, ruta, cuerpo) {
  // Con la cookie, la API pide el origen del juego, como lo manda el navegador.
  const r = cuerpo ? await p.request.post(ruta, { data: cuerpo, headers: { Origin: new URL(web).origin } }) : await p.request.get(ruta);
  assert.ok(r.ok(), ruta + " · " + r.status() + " · " + await r.text());
  return r.json();
}

const partida = (p, id) => api(p, `/api/mesas/${id}/partida`);

/** Una jugada por la API, de quien la tiene legal: solo para llegar al momento que se prueba. */
async function avanzar(paginas, id, hasta, preferencias) {
  for (let n = 0; n < 60; n++) {
    const manos = await Promise.all(paginas.map(p => partida(p, id)));
    if (hasta(manos[0])) return manos;
    assert.ok(!manos[0].vista.resultado, "Terminó la mano antes de lo esperado");
    let jugo = false;
    for (const tipo of preferencias) {
      const i = manos.findIndex(m => m.vista.legales.includes(tipo));
      if (i === -1) continue;
      const accion = tipo === "carta" ? { tipo, carta: manos[i].vista.cartas[0] } : { tipo };
      await api(paginas[i], `/api/mesas/${id}/acciones`, { id: crypto.randomUUID(), version: manos[i].version, accion });
      jugo = true;
      break;
    }
    assert.ok(jugo, "Nadie puede jugar: " + JSON.stringify(manos.map(m => m.vista.legales)));
  }
  assert.fail("La mano no avanzó");
}

/** Lo que una persona puede leer o un lector de pantalla anunciar: texto y atributos, sin direcciones de imágenes. */
const textoDeLaPagina = p => p.evaluate(() => {
  const partes = [document.body.innerText];
  for (const el of document.body.querySelectorAll("*")) {
    for (const { name, value } of el.attributes) if (!["src", "srcset", "href", "style"].includes(name)) partes.push(value);
  }
  return partes.join("\n");
});

const mencion = (texto, carta) =>
  texto.includes(carta) || new RegExp("(^|[^0-9])" + nombrar(carta) + "($|[^a-z])", "i").test(texto);

try {
  const [ana, bruno, clara, diego] = await Promise.all([1, 2, 3, 4].map(pagina));
  await ana.goto("/app/");
  await expect(titulo(ana, "Entrá a jugar")).toBeVisible(espera);
  await boton(ana, "Ingresar").click();
  await ingresarDesdeIdentidad(ana, "ana");
  await expect(titulo(ana, "Mesas en juego")).toBeVisible(espera);
  // Parejas sin señas: la mesa entre cuatro personas no espera las frases de ningún pie.
  const { id } = await api(ana, "/api/mesas", { modo: "2v2", publica: false });
  await ana.goto(`/app/sala/${id}`);
  const enlace = await ana.getByRole("textbox", { name: "Enlace de invitación" }).inputValue();
  const token = new URL(enlace).searchParams.get("invitacion");
  assert.ok(token);

  for (const [p, usuario] of [[bruno, "bruno"], [clara, "clara"], [diego, "diego"]]) {
    await p.goto(enlace);
    await expect(titulo(p, "Te invitaron a una mesa")).toBeVisible(espera);
    await boton(p, "Ingresar").click();
    await ingresarDesdeIdentidad(p, usuario);
    await expect(boton(p, "Ocupar mi asiento")).toBeVisible(espera);
    // Una invitación no muestra el aviso de la comunidad.
    await expect(p.getByRole("region", { name: "Comunidad de Discord" })).toHaveCount(0);
    await boton(p, "Ocupar mi asiento").click();
    await p.waitForURL(/\/app\/(sala|mesa)/, espera);
    await expect.poll(() => p.eventos.filter(u => u.includes("ingreso-mesa"))).toHaveLength(1);
    for (const u of p.eventos) {
      assert.equal(new URL(u).search, "", "un conteo sin consulta");
      assert.ok(!u.includes(token), "un conteo sin el token de la invitación");
    }
  }
  const paginas = [ana, bruno, clara, diego];
  await Promise.all(paginas.map(p => p.waitForURL(`/app/mesa?id=${id}`, espera)));
  await Promise.all(paginas.map(p => expect(p.locator('[data-testid="mesa"] canvas')).toBeVisible(espera)));

  // Cada página tiene solo sus tres cartas: ni el DOM ni /partida nombran las de los demás.
  const manos = await Promise.all(paginas.map(p => partida(p, id)));
  const repartidas = manos.flatMap(m => m.vista.cartas);
  assert.equal(new Set(repartidas).size, 12);
  for (const [i, p] of paginas.entries()) {
    const propias = manos[i].vista.cartas;
    await expect(p.locator('[data-testid^="carta-"]')).toHaveCount(3, espera);
    const enMano = await p.locator('[data-testid^="carta-"]').evaluateAll(els => els.map(e => e.dataset.testid.slice(6)));
    assert.deepEqual([...enMano].sort(), [...propias].sort());
    const texto = await textoDeLaPagina(p);
    const privada = JSON.stringify(manos[i]);
    for (const carta of repartidas.filter(c => !propias.includes(c))) {
      assert.ok(!mencion(texto, carta), `la página ${i} nombra ${carta}, que no es suya`);
      assert.ok(!privada.includes(carta), `la /partida ${i} trae ${carta}, que no es suya`);
    }
  }

  // La hoja «Más» muestra lo que la mesa dice de sus versiones (en la web lo mostraba el pie de página).
  const mesa = await api(ana, "/api/mesas/" + id);
  await boton(ana, "Más").click();
  const mas = ana.getByTestId("hoja-mas");
  await expect(mas).toBeVisible(espera);
  await expect(mas).toContainText(new RegExp("Versión de reglas\\s*" + (mesa.versionReglas == null ? "Sin informar" : "v" + mesa.versionReglas)));
  await expect(mas).toContainText(mesa.edicionModelo?.nombre ?? mesa.politica ?? "Sin informar");
  await boton(ana, "Cerrar la hoja").first().click();
  await expect(mas).toHaveCount(0, espera);

  // «Reportar esta jugada» solo con permiso: bruno lo tiene, clara no.
  const deBruno = await api(bruno, "/api/jugador");
  assert.match(deBruno.id, /^[a-f0-9-]{36}$/);
  await sql(`INSERT INTO juego.reporteros (jugador) VALUES ('${deBruno.id}') ON CONFLICT DO NOTHING`);
  assert.equal((await api(bruno, "/api/jugador")).puedeReportar, true);
  assert.notEqual((await api(clara, "/api/jugador")).puedeReportar, true);
  await Promise.all([bruno, clara].map(async p => {
    await p.reload();
    await expect(p.locator('[data-testid="mesa"] canvas')).toBeVisible(espera);
    await p.getByRole("tab", { name: "Mano", exact: true }).click();
    await expect(p.getByTestId("hoja-mano")).toBeVisible(espera);
  }));
  await expect(boton(clara, "Reportar esta jugada ↗")).toHaveCount(0);
  const [, envio] = await Promise.all([
    boton(bruno, "Reportar esta jugada ↗").click(),
    bruno.context().waitForEvent("request", r => r.method() === "POST" && new URL(r.url()).pathname === `/api/mesas/${id}/reportes`),
  ]);
  const campos = new URLSearchParams(envio.postData() ?? "");
  assert.equal(campos.get("mano"), String(manos[1].manoNumero));
  assert.equal(campos.get("posicion"), String(manos[1].vista.acciones.length));
  for (const extra of bruno.context().pages().filter(p => p !== bruno)) await extra.close();
  for (const p of [bruno, clara]) await boton(p, "Cerrar la hoja").first().click();

  // Tras la primera vuelta las flores ya se declararon y la pareja rival puede responder al truco.
  await avanzar(paginas, id, m => m.vista.vueltas.length === 1, ["flor", "paso-flor", "con-flor-quiero", "quiero", "carta"]);
  const guardadas = await avanzar(paginas, id, m => m.vista.pendiente?.tipo === "truco", ["truco"]);
  const rivales = paginas.filter((_, i) => guardadas[i].vista.legales.includes("quiero"));
  assert.equal(rivales.length, 2);

  // Sin API ni base, cada mesa lo dice; al volver, es la misma partida.
  const reconectando = p => p.getByText("Reconectando…", { exact: true }).first();
  await compose("stop", "api", "db");
  await Promise.all(paginas.map(p => expect(reconectando(p)).toBeVisible(espera)));
  await compose("up", "-d", "--wait", "--wait-timeout", "180", "db", "api");
  await Promise.all(paginas.map(p => expect(reconectando(p)).toHaveCount(0, { timeout: 60_000 })));
  assert.deepEqual(await Promise.all(paginas.map(p => partida(p, id))), guardadas);

  // Los dos «Quiero» salen de la hoja de respuesta de cada rival; la barrera deja pasar los dos POST juntos.
  await Promise.all(rivales.map(p => expect(boton(p, "Quiero")).toBeVisible(espera)));
  let llegar;
  const juntas = new Promise(resolve => { llegar = resolve; });
  let esperando = 0;
  for (const p of rivales) {
    await p.route("**/acciones", async r => {
      if (++esperando === 2) llegar();
      await juntas;
      await r.continue();
    }, { times: 1 });
  }
  const respuestas = await Promise.all(rivales.map(async p => {
    const [r] = await Promise.all([p.waitForResponse(r => r.url().endsWith("/acciones")), boton(p, "Quiero").click()]);
    return r.status();
  }));
  assert.deepEqual(respuestas.sort(), [200, 409]);
  const quieros = m => m.vista.acciones.filter(a => a.tipo === "quiero").length;
  for (const p of paginas) {
    const m = await partida(p, id);
    assert.equal(m.version, guardadas[0].version + 1);
    assert.equal(quieros(m), quieros(guardadas[0]) + 1);
    assert.equal(m.vista.valorTruco, 2);
  }
  // La mesa que perdió la carrera no muestra un error: se refresca.
  for (const p of rivales) await expect(boton(p, "Quiero")).toHaveCount(0, espera);

  await Promise.all(paginas.map(p => p.context().close()));
  console.log("App en parejas de cuatro personas · invitación con conteo y sin comunidad, cartas privadas en el DOM, versiones, reporte con permiso, reinicio de API y base, y dos respuestas simultáneas.");
} finally {
  await browser.close();
}
