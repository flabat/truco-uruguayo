import { expect, test } from "@playwright/test";
import { aplicarOnline, iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { proyectarTercetos } from "../api/partidas-tercetos.ts";
import { canto } from "../src/lib/cantos.ts";
import { comprobarMuestraDelDador } from "./helpers/muestra.mjs";
import { teamSignalsVersion } from "../training/contracts/index.ts";

const id = "54a97db3-c18f-420e-90bd-a23b3060aac7";
const manos = [
  ["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"],
  ["oros-01", "copas-03", "espadas-07"], ["copas-05", "espadas-02", "oros-03"],
  ["bastos-06", "copas-01", "espadas-10"], ["copas-04", "espadas-06", "oros-04"],
];
const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena", "Félix"];
const formatos = { duel: 2, pairs: 4, "pairs-private-senas": 4, triples: 6 };

async function abrir(page, formato, respuesta = false, { jugadores = nombres, muestra = "bastos-01" } = {}) {
  const cantidad = formatos[formato];
  const seis = cantidad === 6;
  const mano = respuesta ? 1 : 0;
  const dador = (mano + cantidad - 1) % cantidad;
  let estado = iniciarOnline({
    versionReparto: seis ? "online-2" : "online-1", mano, dador, muestra,
    manos: manos.slice(0, cantidad),
  });
  if (respuesta) {
    const paso = aplicarOnline(estado, { tipo: "truco", asiento: mano });
    expect(paso.ok).toBe(true);
    estado = paso.estado;
  }
  const asientos = jugadores.slice(0, cantidad).map((nombre, asiento) => ({
    asiento, equipo: asiento % 2, tipo: "computadora",
    nombre: seis && asiento === 0 ? "Computadora de la Costa de Oro" : nombre,
  }));
  const version = respuesta ? 2 : 1;
  const partida = seis ? proyectarTercetos(estado, 1, version, 0) : {
    version, formato, manoNumero: 1, meta: 40, puntos: [0, 0], ganadorPartida: null,
    vista: vistaOnline(estado, 0),
    ...(formato === "pairs-private-senas" && { versionSenas: teamSignalsVersion, turnos: [] }),
  };
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/jugador", r => r.fulfill({ json: { id: "a", nombre: asientos[0].nombre } }));
  await page.route("**/api/mesas/" + id, r => r.fulfill({ json: {
    id, miAsiento: 0, lista: true, asientos, formato, modo: ({ 2: "1v1", 4: "2v2", 6: "3v3" })[cantidad],
  } }));
  await page.route("**/partida", r => r.fulfill({ json: partida }));
  await page.goto("/jugar/?mesa=" + id);
  const zona = page.getByRole("region", { name: "Tapete", exact: true }).getByRole("region", { name: "Zona de juego" });
  await expect(zona.getByRole("button", { name: respuesta ? "Quiero" : "Truco", exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  return { zona, legales: partida.vista.legales };
}

async function comprobarGeometria(page, zona, visible) {
  const rects = await zona.evaluate(el => {
    const { top, bottom, left, right } = el.getBoundingClientRect();
    const cajas = [...el.querySelectorAll("h2, button, select, a")].map(c => {
      const r = c.getBoundingClientRect();
      return { nombre: c.getAttribute("aria-label") || c.textContent, accion: c.tagName !== "H2",
        x: r.x, y: r.y, derecha: r.right, abajo: r.bottom, ancho: r.width, alto: r.height };
    });
    return { top, bottom, left, right, cajas, ancho: innerWidth, alto: innerHeight,
      scroll: document.documentElement.scrollWidth, pagina: scrollY };
  });
  expect(rects.scroll).toBeLessThanOrEqual(page.viewportSize().width);
  for (const caja of rects.cajas) {
    expect(caja.x, caja.nombre).toBeGreaterThanOrEqual(Math.max(0, rects.left) - 1);
    expect(caja.derecha, caja.nombre).toBeLessThanOrEqual(Math.min(rects.ancho, rects.right) + 1);
    expect(caja.y, caja.nombre).toBeGreaterThanOrEqual(rects.top);
    expect(caja.abajo, caja.nombre).toBeLessThanOrEqual(rects.bottom + 1);
    if (caja.accion) {
      expect(caja.ancho, caja.nombre).toBeGreaterThanOrEqual(44);
      expect(caja.alto, caja.nombre).toBeGreaterThanOrEqual(44);
    }
    if (visible) {
      expect(caja.y, caja.nombre).toBeGreaterThanOrEqual(0);
      expect(caja.abajo, caja.nombre).toBeLessThanOrEqual(rects.alto + 1);
    }
  }
  const historia = page.getByRole("region", { name: /^Historial (de la mano|de la redondilla)$/ });
  const despues = await historia.boundingBox();
  expect(despues.y).toBeGreaterThanOrEqual(rects.bottom);
}

async function captura(page, nombre) {
  if (process.env.CAPTURAS_CONTROLES) await page.screenshot({
    path: process.env.CAPTURAS_CONTROLES + "/" + nombre + ".png", scale: "css",
  });
}

test("la pareja queda enfrente, los rivales a los lados y la muestra junto al dador al girar", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 724 });
  const { zona } = await abrir(page, "pairs", false, {
    jugadores: ["Ana", "Computadora 2", "Computadora 3", "Computadora 4"], muestra: "copas-12",
  });
  const centro = async (puesto) => {
    const { x, y, width, height } = await page.locator(`.j-${puesto} .j-persona`).boundingBox();
    return { x: x + width / 2, y: y + height / 2 };
  };
  for (const [width, height] of [[393, 724], [393, 852], [800, 360], [852, 393]]) {
    await page.setViewportSize({ width, height });
    const vertical = height > width;
    const tapete = await page.getByRole("region", { name: "Tapete", exact: true }).boundingBox();
    const campo = await page.locator(".j-puestos").boundingBox();
    expect(tapete.y).toBeLessThan(150);
    if (vertical) expect(campo.height).toBeGreaterThanOrEqual(height * .30);
    const [frente, izquierda, derecha, vos] = await Promise.all(["frente", "izquierda", "derecha", "vos"].map(centro));
    expect(izquierda.x).toBeLessThan(frente.x - campo.width / 4);
    expect(derecha.x).toBeGreaterThan(frente.x + campo.width / 4);
    expect(Math.abs(frente.x - vos.x)).toBeLessThan(4);
    expect(Math.abs(izquierda.y - derecha.y)).toBeLessThan(4);
    const separacion = Math.round(vertical ? campo.height / 4 : 24);
    expect(Math.round(izquierda.y - frente.y)).toBeGreaterThanOrEqual(separacion);
    expect(Math.round(vos.y - derecha.y)).toBeGreaterThanOrEqual(separacion);
    await comprobarGeometria(page, zona, vertical);
    await comprobarMuestraDelDador(page, "copas-12");
    if (height === 852) await captura(page, "ronda-parejas-vertical");
    if (width === 800 && process.env.CAPTURAS_CONTROLES) {
      await page.getByRole("region", { name: "Tapete", exact: true }).screenshot({
        path: process.env.CAPTURAS_CONTROLES + "/ronda-parejas-horizontal.png", scale: "css",
      });
    }
  }
});

test("el menú de la partida conserva la navegación, la búsqueda y el foco de la mano", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 393, height: 724 });
  const { zona } = await abrir(page, "pairs");
  const menu = page.getByRole("button", { name: "Menú", exact: true });
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  const perfil = page.getByRole("link", { name: "Mi perfil" });
  await expect(page.getByRole("heading", { name: "Mesa de truco", level: 1 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Volver al salón" })).toBeVisible();
  await expect(nav).toBeHidden();
  await expect(perfil).toBeHidden();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  // Safari incluye los enlaces en el recorrido con Opción + Tab.
  const tabEnlaces = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(tabEnlaces);
  await expect(nav.getByRole("link", { name: "Inicio", exact: true })).toBeFocused();
  await expect(perfil).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Space");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press(tabEnlaces);
  await expect(page.getByRole("link", { name: "Volver al salón" })).toBeFocused();
  const carta = zona.getByRole("group", { name: "Tus cartas" }).getByRole("button").first();
  await carta.focus();
  await page.keyboard.press("/");
  await expect(page.getByRole("dialog", { name: "Buscar en la guía" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(carta).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(menu).toBeHidden();
  await expect(nav).toBeVisible();
  await expect(perfil).toBeVisible();
});

for (const [formato, cantidad] of Object.entries(formatos)) {
  for (const respuesta of [false, true]) {
    test(formato + (respuesta ? " responde al truco" : " abre la mano") + " con las mismas acciones al girar", async ({ page, isMobile }) => {
      const seis = cantidad === 6;
      const vertical = cantidad === 4 ? { width: 393, height: 852 } : { width: 320, height: 800 };
      await page.setViewportSize(isMobile ? vertical : { width: 1280, height: 900 });
      const { zona, legales } = await abrir(page, formato, respuesta);
      await expect(page.locator(".j-puesto")).toHaveCount(cantidad);
      await expect(zona.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
      if (respuesta) {
        await expect(zona.getByRole("heading", { name: "Podés responder" })).toBeVisible();
        await expect(zona.getByRole("group", { name: "Responder", exact: true }).getByRole("button", { name: "Quiero", exact: true })).toBeEnabled();
      } else {
        await expect(zona.getByRole("group", { name: "Truco", exact: true }).getByRole("button", { name: "Truco", exact: true })).toBeEnabled();
      }
      for (const tipo of legales.filter(t => t !== "carta"))
        await expect(zona.getByRole("button", { name: canto[tipo], exact: true })).toBeEnabled();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await comprobarGeometria(page, zona, isMobile && !seis);
      if (!respuesta && formato === "duel" && isMobile) await captura(page, "duelo-vertical");
      if (respuesta && formato === "pairs" && isMobile) await captura(page, "respuesta-parejas");
      if (!respuesta && formato === "pairs" && !isMobile) {
        await comprobarGeometria(page, zona, true);
        await captura(page, "parejas-escritorio");
      }

      const boton = zona.getByRole("button", { name: respuesta ? "Quiero" : "Truco", exact: true });
      const selector = zona.getByRole("combobox");
      if (formato === "pairs-private-senas") await selector.selectOption("cejas");
      await boton.focus();
      const antes = await zona.ariaSnapshot();
      for (const tamano of [{ width: 800, height: 360 }, { width: 852, height: 393 }]) {
        await page.setViewportSize(tamano);
        // En horizontal la página puede desplazarse hasta el tapete. La mano y todas
        // sus alternativas tienen que caber juntas desde allí.
        await zona.evaluate(el => el.scrollIntoView({ block: "end", behavior: "instant" }));
        await comprobarGeometria(page, zona, true);
        await expect(boton).toBeFocused();
        expect(await zona.ariaSnapshot()).toBe(antes);
        if (formato === "pairs-private-senas") await expect(selector).toHaveValue("cejas");
        if (seis && respuesta && isMobile && tamano.width === 800) await captura(page, "tercetos-horizontal");
      }
      if (isMobile && seis && respuesta) {
        await page.setViewportSize(vertical);
        await page.addStyleTag({ content: "html { font-size: 150%; }" });
        await comprobarGeometria(page, zona, false);
        const inferior = page.locator(".j-vos");
        await expect(inferior.getByText("Computadora de la Costa de Oro")).toBeVisible();
        const muestra = await inferior.getByRole("img", { name: /^Muestra/ }).boundingBox();
        const persona = await inferior.locator(".j-persona").boundingBox();
        expect(muestra.x).toBeGreaterThanOrEqual(persona.x + persona.width);
      }
    });
  }
}
