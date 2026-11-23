import { expect, test } from "@playwright/test";
import { capturarTapete, comprobarMuestraDelDador } from "./helpers/muestra.mjs";
import { readFileSync } from "node:fs";
import { proyectarTercetos } from "../api/partidas-tercetos.ts";
import { aplicarOnline, iniciarOnline } from "../src/motor/mesa-online.ts";

const ejemplo = JSON.parse(readFileSync(new URL("./fixtures/pico-tercetos-v2.json", import.meta.url), "utf8"));

const id = "449e7634-5062-4dec-9063-357975dac55f";
const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena", "Félix"];
const jugadores = nombres.map((nombre, asiento) => ({ nombre, id: "jugador-" + asiento, salonHabilitado: true }));
const asientos = nombres.map((nombre, asiento) => ({ nombre, asiento, equipo: asiento % 2, tipo: "humano" }));
const crearSala = (miAsiento, plazas = asientos) => ({
  id, modo: "3v3", formato: "triples", meta: 26, creadorId: jugadores[0].id,
  miAsiento, asientos: plazas, lista: plazas.every(a => a.tipo !== "vacio"),
  invitacion: "http://localhost/jugar/?invitacion=seis-personas",
});
function abrirRedondilla() {
  return iniciarOnline({ ...ejemplo.reparto, mano: 4, dador: 3 }, [0, 0], ejemplo.meta);
}

function lectura(estado, asiento, version) {
  return proyectarTercetos(estado, estado.lance.tipo === "redondilla" ? 1 : 2, version, asiento);
}

test("la sala de tercetos ofrece cincuenta y guarda los seis asientos y la meta elegida", async ({ page }) => {
  let plazas = asientos.map((a, i) => i === 0 ? a : { ...a, nombre: null, tipo: "vacio" });
  let habilitado = false;
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    let json;
    if (pathname === "/api/jugador") json = jugadores[0];
    if (pathname === "/api/salon/mesas") json = { mesas: [] };
    if (pathname === "/api/modalidades") json = { modos: habilitado ? ["1v1", "2v2", "3v3"] : ["1v1", "2v2"] };
    if (pathname === "/api/mesas") {
      expect(route.request().postDataJSON()).toEqual({ modo: "3v3", meta: 26, publica: false });
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/computadoras")) {
      const { asiento } = route.request().postDataJSON();
      expect(plazas[asiento].tipo).toBe("vacio");
      plazas[asiento] = { ...plazas[asiento], nombre: "Computadora " + asiento, tipo: "computadora" };
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/" + id)) json = { ...crearSala(0, plazas), versionReglas: 2, politica: "tercetos-basica-v1" };
    if (pathname.endsWith("/partida")) json = lectura(abrirRedondilla(), 0, 1);
    await route.fulfill({ json });
  });
  await page.goto("jugar/");
  await page.getByRole("button", { name: "Crear mi mesa" }).click();
  await expect(page.getByRole("radio", { name: /En parejas/ })).toBeVisible();
  const modo = page.getByRole("radio", { name: /3 contra 3/ });
  await expect(modo).toHaveCount(0);
  habilitado = true;
  await page.reload();
  await modo.check();
  const meta = page.getByRole("spinbutton");
  await expect(meta).toHaveValue("50");
  await expect(page.getByText("25 malas y 25 buenas")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  for (const nombre of ["1 contra 1", "2 contra 2"]) {
    await page.getByRole("radio", { name: new RegExp(nombre) }).check();
    await expect(meta).toHaveValue("40");
    await modo.check();
    await expect(meta).toHaveValue("50");
  }
  await meta.fill("26");
  await page.getByRole("button", { name: "Crear mesa", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Esperando jugadores" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Enlace de invitación" })).toHaveValue(/seis-personas/);
  await expect(page.getByText("Chico a 26 tantos.")).toBeVisible();
  await expect(page.locator(".j-lugar small")).toHaveText(["Equipo 1","Equipo 2","Equipo 1","Equipo 2","Equipo 1","Equipo 2"]);
  for (let i = 1; i < 6; i++) await page.getByRole("button", { name: "Agregar computadora al asiento " + (i+1) }).click();
  await expect(page.getByRole("region", { name: "Tapete" })).toBeVisible();
  const cartas = page.getByRole("group", { name: "Tus cartas" }).getByRole("button", { name: /^Jugar / });
  await expect(cartas).toHaveText(["", "", ""], { useInnerText: true });
  const pie = page.getByRole("contentinfo");
  await expect(pie.getByText("Motor de la mesa", { exact: true }).locator("+ dd")).toHaveText("v2");
  const modelo = pie.getByText("Modelo de la mesa", { exact: true }).locator("+ dd");
  const resumen = modelo.locator("summary");
  await expect(resumen).toHaveText("Clásico de tercetos v1 · Publicado el 19 nov 2026");
  await expect(resumen.locator("time")).toHaveAttribute("datetime", "2026-11-19");
  await resumen.press("Enter");
  await expect(modelo.locator("code")).toHaveText("tercetos-basica-v1");
});

test("los seis invitados ven su turno y recuperan su lugar en el pico", async ({ browser, baseURL }, info) => {
  test.setTimeout(75_000);
  let estado = abrirRedondilla(), version = 1;
  const confirmadas = [];
  const acuseEnvido = Promise.withResolvers();
  const sockets = new Map(), contextos = [];
  const ancho = info.project.name === "mobile" ? 320 : 1280;
  function avisar() {
    version++;
    for (const ws of sockets.values()) ws.send(JSON.stringify({ tipo: "actualizar" }));
  }
  try {
    const paginas = await Promise.all(asientos.map(async ({ asiento }) => {
      const contexto = await browser.newContext({ baseURL, viewport: { width: ancho, height: 880 } });
      contextos.push(contexto);
      const page = await contexto.newPage();
      await page.routeWebSocket("**/vivo", ws => sockets.set(asiento, ws));
      await page.route("**/api/**", async route => {
        const { pathname } = new URL(route.request().url());
        let json;
        if (pathname === "/api/jugador") json = jugadores[asiento];
        if (pathname.endsWith("/invitaciones/seis-personas")) json = { publica: false, sentada: true, id };
        if (pathname.endsWith("/unirse") || pathname.endsWith("/" + id)) json = crearSala(asiento);
        if (pathname.endsWith("/acciones")) {
          const datos = route.request().postDataJSON();
          expect(datos.version).toBe(version);
          const accion = { ...datos.accion, asiento };
          const paso = aplicarOnline(estado, accion);
          expect(paso.ok).toBeTruthy();
          confirmadas.push({ duelo: estado.lance.duelo, ...accion });
          estado = paso.estado;
          avisar();
          json = lectura(estado, asiento, version);
          // El aviso público puede llegar antes del acuse privado del cantor.
          if (accion.tipo === "envido") await acuseEnvido.promise;
        }
        if (pathname.endsWith("/partida")) json = lectura(estado, asiento, version);
        await route.fulfill({ json });
      });
      await page.goto("jugar/?invitacion=seis-personas");
      await expect(page.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
      return page;
    }));
    for (const page of paginas) await comprobarMuestraDelDador(page, ejemplo.reparto.muestra);
    for (const i of [0, 5]) {
      const puestos = paginas[i].getByRole("group", { name: "Los seis asientos" });
      await expect(puestos.getByRole("group", { name: /^Asiento / })).toHaveCount(6);
      await expect(puestos.getByRole("group", { name: /Asiento 4/ })).toContainText("Dador");
      await expect(puestos.getByRole("group", { name: new RegExp(nombres[i]) })).toContainText("Vos");
      if (ancho > 760) {
        const yo = await puestos.getByRole("group", { name: new RegExp(nombres[i]) }).boundingBox();
        const enfrente = await puestos.getByRole("group", { name: new RegExp(nombres[(i + 3) % 6]) }).boundingBox();
        expect(yo.y).toBeGreaterThan(enfrente.y + enfrente.height);
        expect(Math.abs((yo.x + yo.width/2) - (enfrente.x + enfrente.width/2))).toBeLessThan(2);
      }
    }
    const florDeAna = aplicarOnline(iniciarOnline({ ...ejemplo.reparto, mano: 0, dador: 5 }), { asiento: 0, tipo: "flor" });
    expect(florDeAna.ok).toBe(true);
    estado = florDeAna.estado;
    avisar();
    const aviso = paginas[1].getByRole("status").getByText("Ana cantó flor.", { exact: true });
    const sinFlor = paginas[1].getByRole("button", { name: "Yo no canto", exact: true });
    await expect(aviso).toBeVisible();
    await expect(sinFlor).toBeEnabled();
    const cajaAviso = await aviso.boundingBox();
    const cajaRespuesta = await sinFlor.boundingBox();
    expect(cajaAviso.y + cajaAviso.height).toBeLessThanOrEqual(cajaRespuesta.y);
    const redondilla = paginas[1].getByRole("region", { name: "Historial de la redondilla" });
    await expect(redondilla.getByRole("listitem")).toHaveText(["Ana dijo «Flor»."]);
    const tapete = await paginas[1].getByRole("region", { name: "Tapete" }).boundingBox();
    expect((await redondilla.boundingBox()).y).toBeGreaterThanOrEqual(tapete.y + tapete.height);
    estado = iniciarOnline(ejemplo.reparto, ejemplo.puntosInicio, ejemplo.meta, ejemplo.numero);
    avisar();
    for (const [i, page] of paginas.entries()) {
      const cartas = page.getByRole("group", { name: "Tus cartas" });
      await expect(page.getByText(/Duelo 1 de 3 ·/)).toBeVisible();
      await expect(cartas).toHaveCount([5, 2].includes(i) ? 1 : 0);
    }
    await expect(paginas[5].getByText(/Si gana tu equipo, cobra 2 tantos/)).toBeVisible();
    await paginas[5].getByRole("button", { name: "Envido", exact: true }).click();
    await paginas[2].getByRole("button", { name: "Quiero", exact: true }).click();
    await expect(paginas[4].getByText("1 buena", { exact: true })).toBeVisible();
    await expect(paginas[4].getByText(/Duelo 1 de 3 ·/)).toBeVisible();
    const historia = paginas[4].getByRole("region", {name: "Historial del duelo"});
    await expect(historia.getByRole("listitem")).toHaveText(["Félix dijo «Envido».", "Clara dijo «Quiero»."]);
    const retiro = paginas[5].getByRole("button", { name: "Irse al mazo" });
    await expect(paginas[5].getByText("1 buena", { exact: true })).toBeVisible();
    await expect(retiro).toBeDisabled();
    acuseEnvido.resolve();
    await expect(retiro).toBeEnabled();
    const [acuseRetiro] = await Promise.all([
      paginas[5].waitForResponse(r => r.url().endsWith("/acciones") && r.request().postDataJSON().accion.tipo === "mazo"),
      retiro.press("Enter"),
    ]);
    expect((await acuseRetiro.json()).lance.duelo).toBe(2);
    await expect(paginas[5].getByRole("heading", { name: "Turno de Ana" })).toBeFocused();
    await expect(paginas[5].getByText("Ya jugaste tu duelo. Esperá el próximo reparto.")).toBeVisible();
    await expect(paginas[0].getByRole("heading", { name: "Tu turno" })).toBeVisible();
    await expect(paginas[0].getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
    await expect(paginas[0].getByRole("group", { name: /Asiento 5 · Elena/ })).toContainText("Dador");
    for (const i of [0, 5]) {
      await paginas[i].reload();
      await expect(paginas[i].getByText(/Duelo 2 de 3 · Ana \(equipo 1\) y Diego \(equipo 2\)/)).toBeVisible();
      await expect(paginas[i].getByRole("group", { name: "Tus cartas" })).toHaveCount(i === 0 ? 1 : 0);
      expect(await paginas[i].evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
    }
    await expect(paginas[4].getByText("Te toca en el duelo 3 de 3.")).toBeVisible();
    await expect(paginas[4].getByText("Tus tantos", {exact: true})).toHaveCount(0);
    await expect(paginas[4].getByText("Último cobro · Equipo 1, 1 tanto por truco.")).toBeVisible();
    await expect(paginas[0].getByText("2 buenas", { exact: true })).toHaveCount(1);
    if (process.env.CAPTURAS_TERCETOS) {
      const i = ancho === 320 ? 5 : 0;
      await paginas[i].locator(".j-partida").screenshot({ path: `${process.env.CAPTURAS_TERCETOS}/tercetos-${ancho}.jpg`, type: "jpeg", quality: 84, scale: "css" });
    }
    await paginas[0].getByRole("button", { name: "Flor", exact: true }).click();
    await paginas[3].reload();
    await expect(paginas[3].getByRole("heading", { name: "Te toca declarar" })).toBeVisible();
    await expect(paginas[3].getByRole("status").getByText("Ana cantó flor.", { exact: true })).toBeVisible();
    await expect(historia.getByRole("listitem")).toHaveText(["Ana dijo «Flor»."]);
    await paginas[3].getByRole("button", { name: "Flor", exact: true }).click();
    await paginas[3].getByRole("button", { name: "Contraflor al resto", exact: true }).click();
    await paginas[0].getByRole("button", { name: "Quiero", exact: true }).click();
    for (const [i, page] of paginas.entries()) {
      await expect(page.getByRole("heading", { name: i % 2 ? "El rival ganó el chico" : "Tu equipo ganó el chico" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Repartir otra mano" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Crear otra mesa" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    }
    expect(confirmadas).toEqual(ejemplo.acciones);
    await expect(historia.getByRole("listitem")).toHaveText([
      "Diego dijo «Flor».", "Diego dijo «Contraflor al resto».", "Ana dijo «Quiero».",
    ]);
    await paginas[4].getByText(/Duelo 2 de 3 · Ganó el equipo 1/).click();
    await expect(paginas[4].getByText("Equipo 1 · 11 tantos por flor (Ana con 38) · valor del canto 15 tantos.")).toBeVisible();
    await expect(paginas[4].getByText("Diego dijo «Contraflor al resto».", { exact: true })).toHaveCount(1);
  } finally {
    acuseEnvido.resolve();
    await Promise.all(contextos.map(ctx => ctx.close()));
  }
});

test("un aviso que cierra dos duelos muestra sus cantos en orden y acredita ambos ganadores al final del reparto", async ({ page }) => {
  const espectadora = 4; // No llegó a jugar su duelo.
  let estado = iniciarOnline(ejemplo.reparto, ejemplo.puntosInicio, ejemplo.meta, ejemplo.numero);
  let version = 1;
  let canal;
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
  await page.routeWebSocket("**/vivo", socket => { canal = socket; });
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    const json = pathname === "/api/jugador" ? { ...jugadores[espectadora], puedeReportar: true } : pathname.endsWith("/partida")
      ? lectura(estado, espectadora, version) : crearSala(espectadora);
    return route.fulfill({ json });
  });
  await page.goto("jugar/?mesa=" + id);
  const tapete = page.getByRole("region", { name: "Tapete" });
  await expect(tapete).toBeVisible();
  await expect(page.getByText("Reconectando con tu mesa…")).toHaveCount(0);
  for (const { duelo, ...accion } of ejemplo.acciones) {
    expect(estado.lance.duelo).toBe(duelo);
    const paso = aplicarOnline(estado, accion);
    expect(paso.ok).toBe(true);
    estado = paso.estado;
    version++;
  }
  canal.send(JSON.stringify({ tipo: "actualizar" }));
  const reporte = page.getByRole("region", { name: "Historial del duelo" }).locator("form");
  for (const [asiento, canto, duelo, posicion] of [
    [5, "Envido", 1, 1], [2, "Quiero", 1, 2], [2, "37 de envido", 1, 2], [5, "Me voy al mazo", 1, 3],
    [0, "Flor", 2, 4], [3, "Flor", 2, 5], [3, "Contraflor al resto", 2, 6], [0, "Quiero", 2, 7], [0, "38 de flor", 2, 7],
  ]) {
    const puesto = tapete.getByRole("group", { name: "Asiento " + (asiento + 1) + " · " + nombres[asiento], exact: true });
    await expect(puesto.locator(".j-voz")).toHaveText(canto);
    await expect(reporte.locator("[name=duelo]")).toHaveValue(String(duelo));
    await expect(reporte.locator("[name=posicion]")).toHaveValue(String(posicion));
    await expect(tapete.locator(".j-prueba-tantos")).toHaveCount(0);
    await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    await page.clock.runFor(1500);
  }
  const flor = tapete.getByRole("figure", { name: "Flor ganadora · 38 tantos" });
  await expect(reporte.locator("[name=fase]")).toHaveValue("resultado");
  await expect(reporte.locator("[name=posicion]")).toHaveValue(String(ejemplo.acciones.length));
  const envido = tapete.getByRole("figure", { name: "Envido ganador · 37 tantos" });
  await expect(flor.getByRole("img")).toHaveCount(3);
  await expect(flor).toContainText("Duelo 2");
  await expect(envido.getByRole("img")).toHaveCount(2);
  await expect(envido).toContainText("Duelo 1");
  const resumen = page.getByRole("region", { name: "Tantos de este reparto" });
  await expect(resumen).toContainText("Tu equipo · +14 tantos");
  await expect(resumen).toContainText("Rivales · 0 tantos");
  await page.getByText(/Duelo 2 de 3 · Ganó el equipo 1/).click();
  const lance = page.getByRole("region", { name: "Tantos de este lance" }).last();
  await expect(lance).toContainText("Equipo 1 · +11 tantos");
  await expect(lance).toContainText("Equipo 2 · 0 tantos");
  await page.reload();
  await expect(page.getByRole("region", { name: "Tantos de este reparto" })).toContainText("Tu equipo · +14 tantos");
});

async function abrirPresentacion(page, leer) {
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
  let canal;
  await page.routeWebSocket("**/vivo", s => { canal = s; });
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    const json = pathname === "/api/jugador" ? jugadores[0] : pathname.endsWith("/partida") ? leer() : crearSala(0);
    return route.fulfill({ json });
  });
  await page.goto("jugar/?mesa=" + id);
  const tapete = page.getByRole("region", { name: "Tapete" });
  await expect(tapete).toBeVisible();
  await expect(page.getByText("Reconectando con tu mesa…")).toHaveCount(0);
  return { tapete, actualizar: () => canal.send(JSON.stringify({ tipo: "actualizar" })),
    desconectar: () => canal.close({ code: 1001, reason: "Corte de prueba" }) };
}

test("la parda que cierra un duelo precede al cobro y a la mano privada del siguiente", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  const reparto = structuredClone(ejemplo.reparto);
  reparto.manos[2][2] = "copas-04";
  reparto.manos[5][2] = "espadas-04";
  let estado = iniciarOnline(reparto, [0, 0], 50, 2);
  let version = 1;
  function tirar(asiento, carta) {
    const paso = aplicarOnline(estado, { tipo: "carta", asiento, carta });
    expect(paso.ok).toBe(true);
    estado = paso.estado;
    version++;
  }
  tirar(5, "bastos-01");
  tirar(2, "oros-02");
  tirar(2, "copas-04");
  const descarga = Promise.withResolvers();
  await page.route("**/img/cartas/tatu/espadas-04.webp", async route => {
    await descarga.promise;
    await route.continue();
  });
  const { tapete, actualizar } = await abrirPresentacion(page, () => lectura(estado, 0, version));
  const mano = tapete.getByRole("group", { name: "Tus cartas" });
  await expect(tapete.getByText(/Duelo 1 de 3 ·/)).toBeVisible();
  tirar(5, "espadas-04");
  actualizar();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(2);
  await page.clock.runFor(3000);
  await expect(tapete.getByText("Parda", { exact: true })).toHaveCount(0);
  await expect(page.locator(".j-tanteador strong")).toHaveText(["0", "0"]);
  await expect(mano).toHaveCount(0);

  descarga.resolve();
  await expect(tapete.getByText("Parda", { exact: true })).toBeVisible();
  await expect(page.locator(".j-tanteador strong")).toHaveText(["1", "0"]);
  await expect(tapete.getByRole("status")).toContainText("La vuelta fue parda.");
  await capturarTapete(page, "parda-del-pico");
  await page.clock.runFor(1999);
  await expect(mano).toHaveCount(0);
  await expect(tapete.getByText(/Duelo 1 de 3 ·/)).toBeVisible();
  await page.clock.runFor(1);
  await expect(tapete.getByText(/Duelo 2 de 3 ·/)).toBeVisible();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(0);
  await expect(mano.getByRole("button")).toHaveCount(3);
  await expect(tapete.getByRole("button", { name: "Flor", exact: true })).toBeEnabled();
});

test("la redondilla presenta las seis cartas y recupera directamente el retiro tras un corte", async ({ page }) => {
  const reparto = structuredClone(ejemplo.reparto);
  [reparto.manos[0][2], reparto.manos[3][2]] = [reparto.manos[3][2], reparto.manos[0][2]];
  let estado = iniciarOnline(reparto, [0, 0], 50, 1);
  let version = 1;
  const { tapete, actualizar, desconectar } = await abrirPresentacion(page, () => lectura(estado, 0, version));
  for (let n = 0; n < 6; n++) {
    const asiento = estado.mano.turno;
    const paso = aplicarOnline(estado, { tipo: "carta", asiento, carta: reparto.manos[asiento][0] });
    expect(paso.ok).toBe(true);
    estado = paso.estado;
    version++;
  }
  actualizar();
  const naipes = tapete.locator(".j-jugada img");
  for (let n = 1; n < 6; n++) {
    await expect(naipes).toHaveCount(n);
    await expect.poll(() => naipes.evaluateAll(cartas => cartas.every(img => img.complete))).toBe(true);
    await expect(tapete.getByText("Ganó Clara", { exact: true })).toHaveCount(0);
    await page.clock.runFor(450);
  }
  await expect(naipes).toHaveCount(6);
  await expect(tapete.getByText("Ganó Clara", { exact: true })).toBeVisible();
  desconectar();
  await expect(tapete.getByRole("heading", { name: /Reconectando/ })).toBeVisible();
  const cierre = aplicarOnline(estado, { tipo: "mazo", asiento: estado.mano.turno });
  expect(cierre.ok).toBe(true);
  estado = cierre.estado;
  version++;
  await page.clock.runFor(400);
  await expect(tapete.getByRole("heading", { name: "Reparto terminado" })).toBeVisible();
  await expect(tapete.getByRole("status")).toContainText("El cierre fue por el retiro al mazo.");
  await expect(naipes).toHaveCount(0);
  await expect(tapete.getByText("Ganó Clara", { exact: true })).toHaveCount(0);
  await expect(page.locator(".j-tanteador strong")).toHaveText(["0", "1"]);
});

test("el mazo sigue con el dador en los tres duelos del pico a pico", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  let estado = iniciarOnline(ejemplo.reparto, [0, 0], 50, ejemplo.numero);
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    const json = pathname === "/api/jugador" ? jugadores[4] : pathname.endsWith("/partida")
      ? lectura(estado, 4, estado.lance.duelo) : crearSala(4);
    return route.fulfill({ json });
  });

  function aplicar(acciones) {
    for (const accion of acciones) {
      const paso = aplicarOnline(estado, accion);
      expect(paso.ok).toBe(true);
      estado = paso.estado;
    }
  }

  const tapete = page.getByRole("region", { name: "Tapete" });
  const activas = tapete.locator('[data-activo="true"] .j-persona b');
  const acciones = ejemplo.acciones.map(({ duelo, ...accion }) => accion);
  for (const [i, activos] of [["Clara", "Félix"], ["Ana", "Diego"], ["Bruno", "Elena"]].entries()) {
    if (i === 0) await page.goto("jugar/?mesa=" + id);
    if (i === 1) { aplicar(acciones.slice(0, 3)); await page.reload(); }
    if (i === 2) { aplicar([...acciones.slice(3), { tipo: "mazo", asiento: 0 }]); await page.reload(); }
    await expect(page.getByText(new RegExp("Duelo " + (i + 1) + " de 3 ·"))).toBeVisible();
    await expect(activas).toHaveText(activos);
    await comprobarMuestraDelDador(page, ejemplo.reparto.muestra);
    const dador = tapete.getByRole("group", { name: "Asiento 5 · Elena" });
    await expect(dador).toHaveClass(/j-vos/);
    await expect(dador.getByRole("img", { name: /^Muestra / })).toHaveCount(1);
    await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(i === 2 ? 1 : 0);
    if (i === 2) {
      await capturarTapete(page, "tercetos");
      const anterior = page.getByRole("region", { name: "Historial del reparto" }).locator("summary").first();
      await anterior.press("Enter");
      const zona = tapete.getByRole("region", { name: "Zona de juego" });
      const contenido = await zona.ariaSnapshot();
      await page.setViewportSize({ width: 852, height: 393 });
      await expect(anterior).toBeFocused();
      await expect(anterior.locator("..")).toHaveAttribute("open", "");
      expect(await zona.ariaSnapshot()).toBe(contenido);
      await expect(activas).toHaveText(activos);
    }
  }
});
