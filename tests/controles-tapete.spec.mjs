import { expect, test } from "@playwright/test";
import { aplicarOnline, iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { proyectarTercetos } from "../api/partidas-tercetos.ts";
import { canto } from "../src/lib/cantos.ts";
import { teamSignalsVersion } from "../training/contracts/index.ts";

const id = "54a97db3-c18f-420e-90bd-a23b3060aac7";
const manos = [
  ["espadas-03", "oros-06", "bastos-02"], ["oros-07", "oros-11", "bastos-03"],
  ["oros-01", "copas-03", "espadas-07"], ["copas-05", "espadas-02", "oros-03"],
  ["bastos-06", "copas-01", "espadas-10"], ["copas-04", "espadas-06", "oros-04"],
];
const nombres = ["Ana", "Bruno", "Clara", "Diego", "Elena", "Félix"];
const formatos = { duel: 2, pairs: 4, "pairs-private-senas": 4, triples: 6 };

async function abrir(page, formato, respuesta = false) {
  const cantidad = formatos[formato];
  const seis = cantidad === 6;
  const mano = respuesta ? 1 : 0;
  const dador = (mano + cantidad - 1) % cantidad;
  let estado = iniciarOnline({
    versionReparto: seis ? "online-2" : "online-1", mano, dador, muestra: "bastos-01",
    manos: manos.slice(0, cantidad),
  });
  if (respuesta) {
    const paso = aplicarOnline(estado, { tipo: "truco", asiento: mano });
    expect(paso.ok).toBe(true);
    estado = paso.estado;
  }
  const asientos = nombres.slice(0, cantidad).map((nombre, asiento) => ({
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
  expect(rects.scroll).toBeLessThanOrEqual(rects.ancho);
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

for (const [formato, cantidad] of Object.entries(formatos)) {
  for (const respuesta of [false, true]) {
    test(formato + (respuesta ? " responde al truco" : " abre la mano") + " con las mismas acciones al girar", async ({ page, isMobile }) => {
      const seis = cantidad === 6;
      const vertical = cantidad === 4 ? { width: 393, height: 852 } : { width: 320, height: 800 };
      await page.setViewportSize(isMobile ? vertical : { width: 1280, height: 900 });
      const { zona, legales } = await abrir(page, formato, respuesta);
      await expect(page.locator(".j-puesto")).toHaveCount(cantidad);
      await expect(zona.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(3);
      for (const tipo of legales.filter(t => t !== "carta"))
        await expect(zona.getByRole("button", { name: canto[tipo], exact: true })).toBeEnabled();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await comprobarGeometria(page, zona, isMobile && !seis);
      if (!respuesta && formato === "duel" && isMobile) await captura(page, "duelo-vertical");
      if (respuesta && formato === "pairs" && isMobile) await captura(page, "respuesta-parejas");
      if (!respuesta && formato === "pairs" && !isMobile) await captura(page, "parejas-escritorio");

      const boton = zona.getByRole("button", { name: respuesta ? "Quiero" : "Truco", exact: true });
      const selector = zona.getByRole("combobox");
      if (formato === "pairs-private-senas") await selector.selectOption("cejas");
      await boton.focus();
      const antes = await zona.ariaSnapshot();
      for (const tamano of [{ width: 800, height: 360 }, { width: 852, height: 393 }]) {
        await page.setViewportSize(tamano);
        // En horizontal la página puede desplazarse hasta el tapete. La mano y todas
        // sus alternativas tienen que caber juntas desde allí.
        await zona.evaluate(el => el.scrollIntoView({ block: "end" }));
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
