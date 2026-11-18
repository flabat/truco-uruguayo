import { expect, test } from "@playwright/test";
import { comprobarMuestra, posicionEnTapete } from "./helpers/muestra.mjs";

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const jugar = (page, carta) => boton(page, "Jugar " + carta).click();
const titulo = (page, name) => page.getByRole("heading", { name, exact: true });

async function semillaFija(page, semilla) {
  await page.addInitScript((valor) => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (datos) => {
      if (datos instanceof Uint32Array && datos.length === 1) {
        datos[0] = valor;
        return datos;
      }
      return original(datos);
    };
  }, semilla);
}

async function seleccionar(page, cartas) {
  for (const carta of cartas) await boton(page, carta).click();
  await boton(page, "Confirmar cartas").click();
}

async function contar(page, total) {
  const entrada = page.getByRole("spinbutton", { name: "Tu total" });
  await entrada.fill(String(total));
  await entrada.press("Enter");
}

test("mano de tres vueltas, regreso desde la ruta, replay y dador nuevo", async ({ page }) => {
  await semillaFija(page, 830838);
  await page.goto("aprender/");
  await page.getByRole("link", { name: "Jugar una mano guiada" }).click();
  await expect(page).toHaveURL("aprender/mano/");
  await expect(page.locator("#turno-mesa")).toHaveText("Sos mano");
  await comprobarMuestra(page, "copas-06");
  const posicion = await posicionEnTapete(page);
  const visibles = await page.locator(".guiada img").evaluateAll((imgs) =>
    [...new Set(imgs.map((img) => img.src.split("/").at(-1)))].sort());
  expect(visibles).toEqual(["bastos-03.webp", "copas-02.webp", "copas-06.webp", "oros-05.webp", "reverso.webp"]);
  await boton(page, "Tengo flor").click();
  await boton(page, "Pedir una pista").click();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Apartá la pieza");
  await boton(page, "Sin flor").focus();
  await page.keyboard.press("Enter");
  await expect(titulo(page, "¿Qué cartas entran en la cuenta?")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(boton(page, "2 de copas")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await page.reload();
  await expect(boton(page, "5 de oros")).toHaveAttribute("aria-pressed", "true");
  await expect(boton(page, "2 de copas")).toHaveAttribute("aria-pressed", "true");
  await boton(page, "Confirmar cartas").click();
  await expect(page.getByRole("spinbutton")).toBeFocused();
  await page.getByRole("link", { name: "Volver a aprender" }).click();
  await expect(page.locator('[data-avance="reconocer-flor"]')).toContainText("0 manos resueltas");
  await page.getByRole("link", { name: "Jugar una mano guiada" }).click();
  await expect(titulo(page, "¿Cuántos tantos tenés?")).toBeVisible();
  await contar(page, 35);
  await expect(page.getByRole("status")).toContainText("30 + 5 = 35");
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(3);
  await jugar(page, "3 de bastos");
  await expect(page.getByRole("status")).toContainText("Guardaste una pieza, 2 de copas");
  await expect(page.locator("#guia-turno")).toContainText("La pareja rival va ganando con 3 de oros");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(2);
  await comprobarMuestra(page, "copas-06");
  expect(await posicionEnTapete(page)).toEqual(posicion);
  await jugar(page, "2 de copas");
  await jugar(page, "5 de oros");
  await expect(titulo(page, "La pareja rival ganó la mano")).toBeFocused();
  await expect(page.locator("#vueltas > li")).toHaveCount(3);
  const resumen = await page.locator("#vueltas").innerText();
  await boton(page, "Reproducir la mano").click();
  await expect(boton(page, "Anterior")).toBeDisabled();
  await boton(page, "Siguiente jugada").click();
  await expect(page.locator("#guia-turno")).toHaveText("Vos jugaste 3 de bastos.");
  await page.reload();
  await expect(titulo(page, "Jugada 1 de 12")).toBeVisible();
  await boton(page, "Anterior").click();
  for (let i = 0; i < 12; i++) {
    await boton(page, "Siguiente jugada").click();
    expect(await posicionEnTapete(page)).toEqual(posicion);
  }
  await comprobarMuestra(page, "copas-06");
  expect(await page.locator("#vueltas").innerText()).toEqual(resumen);
  await expect(boton(page, "Siguiente jugada")).toHaveCount(0);
  await boton(page, "Volver al resultado").click();
  await boton(page, "Repartir de nuevo").click();
  await page.reload();
  await comprobarMuestra(page, "oros-02");
  await expect(page.locator(".asiento-0")).toContainText("Dador");
  await expect(page.locator(".asiento-1")).toContainText("Mano");
  await expect(titulo(page, "¿Tenés flor en esta mano?")).toBeVisible();
  await expect(page.locator("#mis-cartas")).not.toHaveText("2 de copas5 de oros3 de bastos");
  await page.getByRole("link", { name: "Volver a aprender" }).click();
  await expect(page.locator('[data-avance="contar-envido"]')).toContainText("1 mano resuelta");
  await page.getByRole("link", { name: "Jugar una mano guiada" }).click();
  await expect(page.locator("#turno-mesa")).toHaveText("Sale el rival de la derecha");
});

test("flor y dos vueltas a 320 px con almacenamiento bloqueado", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await semillaFija(page, 0);
  await page.addInitScript(() => {
    for (const nombre of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, nombre, { get() { throw new Error("Deshabilitado"); } });
    }
  });
  await page.goto("aprender/mano/");
  await boton(page, "Tengo flor").click();
  await expect(page.locator("#momento")).toHaveText("Contar flor");
  for (const carta of ["3 de espadas", "5 de copas", "As de espadas"]) {
    const caja = await boton(page, carta).boundingBox();
    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(320);
  }
  await seleccionar(page, ["3 de espadas", "5 de copas", "As de espadas"]);
  await contar(page, 32);
  await jugar(page, "3 de espadas");
  await jugar(page, "5 de copas");
  await expect(titulo(page, "La pareja rival ganó la mano")).toBeVisible();
  await expect(page.locator("#guia-turno")).toContainText("ganó las dos primeras vueltas");
  await expect(page.locator("#vueltas > li")).toHaveCount(2);
  await expect(page.locator("#mesa-guiada")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await boton(page, "Repartir de nuevo").click();
  await expect(page.locator(".asiento-0")).toContainText("Dador");
});

test("si el compañero ya gana se puede jugar cualquiera de las dos cartas", async ({ page }) => {
  await semillaFija(page, 6);
  await page.goto("aprender/mano/");
  await boton(page, "Sin flor").click();
  await seleccionar(page, ["Rey de copas", "5 de copas"]);
  await contar(page, 25);
  await jugar(page, "rey de copas");
  await expect(page.locator("#guia-turno")).toContainText("Tu compañero va ganando con 5 de espadas");
  await expect(boton(page, "Jugar rey de oros")).toBeEnabled();
  await expect(boton(page, "Jugar 5 de copas")).toBeEnabled();
  await jugar(page, "rey de oros");
  await expect(titulo(page, "Tu pareja ganó la mano")).toBeVisible();
  await page.locator("#vueltas summary").last().click();
  await expect(page.locator("#vueltas ol").last()).toContainText("Vos · rey de oros");
  await page.getByRole("link", { name: "Siguiente lección · Cantar y responder al truco" }).click();
  await expect(page).toHaveURL("aprender/truco/");
  await expect(boton(page, "Cantar truco")).toBeEnabled();
  await page.getByRole("link", { name: "Volver a la mano guiada" }).click();
  await expect(titulo(page, "Tu pareja ganó la mano")).toBeVisible();
});

test("consultar la regla conserva las cartas y la ayuda tras volver o recargar", async ({ page }) => {
  await semillaFija(page, 830838);
  await page.goto("aprender/mano/");
  const regla = page.locator(".mesa-consulta summary");
  await expect(regla).toContainText("cuenta como ayuda");
  await regla.press("Enter");
  await expect(page.locator("#regla-mesa")).toContainText("Hay flor con tres cartas");
  await page.reload();
  await boton(page, "Sin flor").click();
  await seleccionar(page, ["2 de copas", "5 de oros"]);
  await page.getByRole("spinbutton").fill("35");
  await regla.press("Enter");
  const abierta = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Leer el capítulo completo en otra pestaña" }).press("Enter");
  const capitulo = await abierta;
  await expect(capitulo).toHaveURL("reglas/envido/");
  await capitulo.close();
  await expect(page.getByRole("spinbutton")).toHaveValue("35");
  await expect(page.locator("#mis-cartas .ap-elegida")).toHaveText(["2 de copas", "5 de oros"]);
  await page.reload();
  await contar(page, 35);
  await expect(page.locator("#aviso-consulta-mesa")).toBeHidden();
  await page.getByRole("link", { name: "Volver a aprender" }).click();
  for (const tema of ["reconocer-flor", "contar-envido"]) {
    await expect(page.locator(`[data-avance="${tema}"]`)).toContainText("En práctica · 0 manos resueltas");
  }
});

async function turnoDeApertura(page) {
  await page.goto("aprender/mano/");
  await expect(boton(page, "Comparar mis cartas")).toBeHidden();
  await boton(page, "Sin flor").click();
  await seleccionar(page, ["2 de copas", "5 de oros"]);
  await expect(boton(page, "Comparar mis cartas")).toBeHidden();
  await contar(page, 35);
}

test("el análisis opcional conserva la mano y el progreso, y comparte cifras con la lección", async ({ page }) => {
  await semillaFija(page, 830838);
  const workers = [];
  page.on("worker", worker => workers.push(worker.url()));
  await turnoDeApertura(page);
  const guardado = () => page.evaluate(() => [sessionStorage.getItem("truco-oriental.mano-guiada.v1"),
    localStorage.getItem("truco-oriental.aprendizaje")]);
  const inicial = await guardado();
  expect(workers).toEqual([]);
  await expect(page.locator("astro-island")).toHaveCount(0);
  const abrir = boton(page, "Comparar mis cartas");
  await abrir.focus();
  await abrir.press("Enter");
  const tabla = page.getByRole("table", { name: "Chances de que tu pareja gane la mano" });
  await expect(tabla).toBeVisible({ timeout: 20000 });
  await expect(tabla.getByRole("row", { name: /3 de bastos/ })).toContainText("13.779 de 20.000");
  await expect(page.locator("#metodo-chances")).toContainText("Estimación por simulación");
  expect(workers.length).toBe(1);
  await expect(boton(page, "Cerrar comparación")).toBeFocused();
  await page.locator("#diferencias-chances summary").press("Enter");
  await expect(page.locator("#diferencias-chances li")).toHaveCount(3);
  await expect(page.locator("#diferencias-chances")).toContainText("8,78 puntos porcentuales");
  const filas = await tabla.locator("tbody tr").allTextContents();
  await boton(page, "Cerrar comparación").press("Enter");
  await expect(abrir).toBeFocused();
  await expect(tabla).toBeHidden();
  expect(await guardado()).toEqual(inicial);
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(3);
  await abrir.press("Enter");
  await expect(tabla).toBeVisible();
  expect(workers.length).toBe(1);
  await page.getByRole("link", { name: "Volver a aprender" }).click();
  await page.getByRole("link", { name: /Probabilidad de ganar la mano/ }).click();
  await expect(page).toHaveURL("aprender/probabilidad/");
  await boton(page, "Ver chances").click();
  const otra = page.getByRole("table", { name: "Victorias de tu pareja por carta jugada" });
  await expect(otra).toBeVisible({ timeout: 20000 });
  expect((await otra.locator("tbody tr").allTextContents()).toSorted()).toEqual(filas.toSorted());
});

test("jugar o mover el replay cancela el cálculo y descarta la respuesta de un turno anterior", async ({ page }) => {
  await semillaFija(page, 830838);
  await page.addInitScript(() => {
    window.pedidosChances = [];
    window.Worker = class {
      postMessage(pedido) {
        const entregar = this.onmessage;
        this.registro = { pedido, cancelado: false, terminar: () => entregar({ data: {
          tipo: "resultado", requestId: pedido.requestId, clave: pedido.clave, resultado: { tipo: "incompatible" },
        } }) };
        window.pedidosChances.push(this.registro);
      }
      terminate() { this.registro.cancelado = true; }
    };
  });
  await turnoDeApertura(page);
  const abrir = boton(page, "Comparar mis cartas");
  await abrir.click();
  await jugar(page, "3 de bastos");
  await expect(page.locator("#panel-chances")).toBeHidden();
  await abrir.click();
  const pedidos = await page.evaluate(() => {
    const [antes, ahora] = window.pedidosChances;
    antes.terminar();
    return { cancelado: antes.cancelado, antes: antes.pedido.posicion, ahora: ahora.pedido.posicion };
  });
  expect(pedidos.cancelado).toBe(true);
  expect(pedidos.antes.jugadas).toHaveLength(0);
  expect(pedidos.ahora.jugadas.length).toBeGreaterThan(0);
  expect(Object.keys(pedidos.ahora).sort()).toEqual(["asiento", "cartas", "dador", "jugadas", "muestra", "version"]);
  await expect(page.locator("#estado-chances")).toHaveText("Calculando las chances de tu pareja…");
  await expect(page.locator("#resultado-chances")).toBeHidden();
  await jugar(page, "2 de copas");
  await jugar(page, "5 de oros");
  await expect(abrir).toBeHidden();
  await boton(page, "Reproducir la mano").click();
  await abrir.click();
  expect(await page.evaluate(() => window.pedidosChances.at(-1).pedido.posicion)).toEqual(pedidos.antes);
  await boton(page, "Siguiente jugada").click();
  await expect(abrir).toBeHidden();
  await page.reload();
  await expect(page.locator("#consulta-chances")).toBeHidden();
  await boton(page, "Volver al resultado").click();
  await boton(page, "Repartir de nuevo").click();
  await expect(page.locator("#consulta-chances")).toBeHidden();
});
