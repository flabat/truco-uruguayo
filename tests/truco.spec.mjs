import { expect, test } from "@playwright/test";
import { capturarTapete, comprobarMuestraDelDador, posicionEnTapete } from "./helpers/muestra.mjs";

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const titulo = (page, name) => page.getByRole("heading", { name, exact: true });

test("el quiero del rival conserva las cartas y la reproducción explica el turno y el tanteo", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("aprender/");
  await page.getByRole("link", { name: /Cantar y responder al truco/ }).click();
  await expect(page).toHaveURL("aprender/truco/");
  await expect(page.getByText(/Nadie tiene flor/)).toBeVisible();
  const vos = page.getByRole("region", { name: "Tapete" }).getByRole("group", { name: "Vos", exact: true });
  const misCartas = vos.getByRole("group", { name: "Tus cartas" });
  const antes = await misCartas.textContent();
  await comprobarMuestraDelDador(page, "bastos-10");
  await capturarTapete(page, "truco");
  const posicion = await posicionEnTapete(page);
  const muestra = await page.getByRole("img", { name: /^Muestra / }).textContent();
  await boton(page, "Cantar truco").press("Enter");
  await expect(titulo(page, "¿Qué carta jugás?")).toBeFocused();
  await expect(page.locator("#guia-turno")).toContainText("El rival quiso. Conservás el turno.");
  await expect(misCartas).toHaveText(antes);
  await boton(page, "Jugar rey de bastos").click();
  await page.reload();
  await boton(page, "Jugar 6 de espadas").click();
  await expect(titulo(page, "La pareja rival cobra 2 tantos")).toBeFocused();
  await boton(page, "Reproducir la mano").click();
  await expect(boton(page, "Anterior")).toBeDisabled();
  await boton(page, "Siguiente acción").press("Space");
  await expect(page.locator(".j-estado-vuelta")).toContainText("Falta responder al truco");
  await page.reload();
  await expect(titulo(page, "Acción 1 de 10")).toBeVisible();
  await boton(page, "Siguiente acción").click();
  await expect(page.locator(".j-estado-vuelta")).toContainText("Tu turno");
  await expect(page.locator("#guia-turno")).toContainText("Conserva el turno");
  await boton(page, "Siguiente acción").click();
  await comprobarMuestraDelDador(page, "bastos-10");
  expect(await posicionEnTapete(page)).toEqual(posicion);
  await expect(vos.locator(".j-jugada").getByRole("img", { name: "Rey de bastos" })).toBeVisible();
  await expect(misCartas.locator("img")).toHaveCount(2);
  await expect(misCartas).not.toContainText("Rey de bastos");
  await expect(misCartas.getByRole("button")).toHaveCount(0);
  await boton(page, "Anterior").click();
  await expect(vos.locator(".j-jugada")).toBeHidden();
  await expect(misCartas).toHaveText(antes);
  await boton(page, "Volver al resultado").click();
  await boton(page, "Repartir de nuevo").click();
  await expect(misCartas).not.toHaveText(antes);
  await expect(page.getByRole("img", { name: /^Muestra / })).not.toHaveText(muestra);
  await comprobarMuestraDelDador(page);
  await boton(page, "Practicar la respuesta").click();
  await boton(page, "No quiero").click();
  await boton(page, "Repetir el ejemplo").click();
  await expect(page.getByRole("img", { name: "Muestra Sota de bastos", exact: true })).toBeVisible();
});

test("el aprendiz puede rechazar o querer el mismo truco y comprobar la salida rival", async ({ page, isMobile }) => {
  const width = isMobile ? 320 : 1280;
  await page.setViewportSize({ width, height: 800 });
  await page.goto("aprender/truco/");
  await boton(page, "Practicar la respuesta").click();
  await page.reload();
  await expect(titulo(page, "Te cantaron truco. ¿Querés?")).toBeVisible();
  const vos = page.getByRole("region", { name: "Tapete" }).getByRole("group", { name: "Vos", exact: true });
  const mano = vos.getByRole("group", { name: "Tus cartas" });
  const imagenes = mano.locator("img");
  await expect(imagenes).toHaveCount(3);
  await expect(page.locator(".mesa-panel img")).toHaveCount(0);
  // El scroll suave tras devolver el foco puede avanzar entre dos llamadas a Playwright.
  const { asiento, cartas } = await vos.evaluate(async elemento => {
    const imagenes = [...elemento.querySelectorAll('[aria-label="Tus cartas"] img')];
    await Promise.all(imagenes.map(imagen => imagen.decode()));
    await document.fonts.ready;
    return {
      asiento: elemento.getBoundingClientRect().toJSON(),
      cartas: imagenes.map(imagen => imagen.getBoundingClientRect().toJSON()),
    };
  });
  expect(cartas).toHaveLength(3);
  let bordeAnterior = asiento.x;
  for (const carta of cartas) {
    expect(carta.width).toBeGreaterThanOrEqual(44);
    expect(carta.x).toBeGreaterThanOrEqual(bordeAnterior);
    expect(carta.y).toBeGreaterThanOrEqual(asiento.y);
    expect(carta.y + carta.height).toBeLessThanOrEqual(asiento.y + asiento.height);
    bordeAnterior = carta.x + carta.width;
  }
  expect(bordeAnterior).toBeLessThanOrEqual(asiento.x + asiento.width);
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(0);
  for (const texto of ["Quiero", "No quiero"]) {
    const caja = await boton(page, texto).boundingBox();
    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.x + caja.width).toBeLessThanOrEqual(width);
  }
  await boton(page, "No quiero").press("Space");
  await expect(titulo(page, "La pareja rival cobra 1 tanto")).toBeFocused();
  await page.locator("#historial-truco summary").click();
  await expect(page.locator("#acciones-truco li")).toHaveText(["Rival de la derecha dijo «Truco».", "Vos dijiste «No quiero»."]);
  await boton(page, "Repetir el ejemplo").click();
  await boton(page, "Quiero").press("Enter");
  await expect(page.locator("#acciones-truco li").nth(2)).toHaveText("Rival de la derecha jugó rey de bastos.");
  await expect(page.locator("#momento")).toContainText("2 tantos en juego");
  await expect(page.locator("#guia-turno")).toContainText("El rival conservó la salida");
  await page.keyboard.press("Tab");
  await expect(mano.getByRole("button").first()).toBeFocused();
  await boton(mano, "Jugar caballo de bastos").press("Enter");
  await boton(page, "Jugar 3 de oros").click();
  await expect(titulo(page, "Tu pareja cobra 2 tantos")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test("las mismas vueltas valen uno sin canto y dos si se canta antes de la segunda carta", async ({ page }) => {
  await page.goto("aprender/truco/");
  await boton(page, "Jugar rey de bastos").click();
  await boton(page, "Jugar 6 de espadas").click();
  await expect(titulo(page, "La pareja rival cobra 1 tanto")).toBeVisible();
  await boton(page, "Repetir el ejemplo").click();
  await boton(page, "Jugar rey de bastos").click();
  await boton(page, "Cantar truco").click();
  await expect(page.locator("#momento")).toHaveText("Vuelta 2 · 2 tantos en juego");
  await boton(page, "Jugar 6 de espadas").click();
  await expect(titulo(page, "La pareja rival cobra 2 tantos")).toBeVisible();
});
