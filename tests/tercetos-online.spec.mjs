import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { proyectarTercetos } from "../api/partidas-tercetos.ts";
import { aplicarOnline, iniciarOnline } from "../src/motor/mesa-online.ts";

const ejemplo = JSON.parse(readFileSync(new URL("./fixtures/pico-tercetos-v2.json", import.meta.url), "utf8"));

const id = "449e7634-5062-4dec-9063-357975dac55f";
const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena", "Félix"];
const jugadores = nombres.map((nombre, asiento) => ({ nombre, id: "jugador-" + asiento }));
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
    if (pathname === "/api/modalidades") json = { modos: habilitado ? ["1v1", "2v2", "3v3"] : ["1v1", "2v2"] };
    if (pathname === "/api/mesas") {
      expect(route.request().postDataJSON()).toEqual({ modo: "3v3", meta: 26 });
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/computadoras")) {
      const { asiento } = route.request().postDataJSON();
      expect(plazas[asiento].tipo).toBe("vacio");
      plazas[asiento] = { ...plazas[asiento], nombre: "Computadora " + asiento, tipo: "computadora" };
      json = crearSala(0, plazas);
    }
    if (pathname.endsWith("/" + id)) json = crearSala(0, plazas);
    if (pathname.endsWith("/partida")) json = lectura(abrirRedondilla(), 0, 1);
    await route.fulfill({ json });
  });
  await page.goto("jugar/");
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
    if (ancho > 760) {
      for (const page of paginas) {
        // Girar hacia la derecha desde la perspectiva de quien reparte y mira al centro.
        const aLaDerecha = await page.getByRole("group", { name: "Los seis asientos" }).evaluate(mesa => {
          const centro = elemento => {
            const { x, y, width, height } = elemento.getBoundingClientRect();
            return [x + width / 2, y + height / 2];
          };
          const muestra = mesa.querySelector(".j-seis-muestra");
          const [mx, my] = centro(muestra);
          const [dx, dy] = centro(muestra.parentElement.querySelector(".j-seis-nombre"));
          const [cx, cy] = centro(mesa.querySelector(".j-seis-centro"));
          return (mx - dx) * (dy - cy) + (my - dy) * (cx - dx) > 0;
        });
        expect(aLaDerecha).toBe(true);
      }
    }
    for (const i of [0, 5]) {
      const puestos = paginas[i].getByRole("group", { name: "Los seis asientos" });
      await expect(puestos.getByRole("group")).toHaveCount(6);
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
    const sinFlor = paginas[1].getByRole("button", { name: "Sin flor", exact: true });
    await expect(aviso).toBeVisible();
    await expect(sinFlor).toBeEnabled();
    const cajaAviso = await aviso.boundingBox();
    const cajaRespuesta = await sinFlor.boundingBox();
    expect(cajaAviso.y + cajaAviso.height).toBeLessThanOrEqual(cajaRespuesta.y);
    const redondilla = paginas[1].getByRole("region", { name: "Historial de la redondilla" });
    await expect(redondilla.getByRole("listitem")).toHaveText(["Ana dijo «Flor»."]);
    if (ancho <= 760) {
      const tapete = await paginas[1].getByRole("region", { name: "Tapete" }).boundingBox();
      expect((await redondilla.boundingBox()).y).toBeLessThan(tapete.y);
    }
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
    const json = pathname === "/api/jugador" ? jugadores[espectadora] : pathname.endsWith("/partida")
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
  for (const [asiento, canto] of [
    [5, "Envido"], [2, "Quiero"], [2, "37 de envido"], [5, "Me voy al mazo"],
    [0, "Flor"], [3, "Flor"], [3, "Contraflor al resto"], [0, "Quiero"], [0, "38 de flor"],
  ]) {
    const puesto = tapete.getByRole("group", { name: "Asiento " + (asiento + 1) + " · " + nombres[asiento], exact: true });
    await expect(puesto.locator(".j-voz")).toHaveText(canto);
    await expect(tapete.locator(".j-prueba-tantos")).toHaveCount(0);
    await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    await page.clock.runFor(1500);
  }
  const flor = tapete.getByRole("figure", { name: "Flor ganadora · 38 tantos" });
  const envido = tapete.getByRole("figure", { name: "Envido ganador · 37 tantos" });
  await expect(flor.getByRole("img")).toHaveCount(3);
  await expect(flor).toContainText("Duelo 2");
  await expect(envido.getByRole("img")).toHaveCount(2);
  await expect(envido).toContainText("Duelo 1");
});
