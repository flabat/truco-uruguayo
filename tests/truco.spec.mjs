import { expect, test } from "@playwright/test";
import { comprobarMuestra, posicionEnTapete } from "./helpers/muestra.mjs";

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const titulo = (page, name) => page.getByRole("heading", { name, exact: true });

test("el quiero del rival conserva las cartas y la reproducción explica el turno y el tanteo", async ({ page }) => {
  await page.goto("aprender/");
  await page.getByRole("link", { name: /Cantar y responder al truco/ }).click();
  await expect(page).toHaveURL("aprender/truco/");
  await expect(page.getByText(/Nadie tiene flor/)).toBeVisible();
  const misCartas = page.getByRole("group", { name: "Tus cartas" });
  const antes = await misCartas.textContent();
  await comprobarMuestra(page, "bastos-10");
  const posicion = await posicionEnTapete(page);
  const muestra = await page.locator("#muestra").textContent();
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
  await expect(page.locator("#turno-mesa")).toHaveText("Falta responder al truco");
  await page.reload();
  await expect(titulo(page, "Acción 1 de 10")).toBeVisible();
  await boton(page, "Siguiente acción").click();
  await expect(page.locator("#turno-mesa")).toHaveText("Tu turno");
  await expect(page.locator("#guia-turno")).toContainText("Conserva el turno");
  await boton(page, "Siguiente acción").click();
  await comprobarMuestra(page, "bastos-10");
  expect(await posicionEnTapete(page)).toEqual(posicion);
  await expect(page.locator(".asiento-0")).toContainText("Rey de bastos");
  await boton(page, "Volver al resultado").click();
  await boton(page, "Repartir de nuevo").click();
  await expect(misCartas).not.toHaveText(antes);
  await expect(page.locator("#muestra")).not.toHaveText(muestra);
  await comprobarMuestra(page);
  await boton(page, "Practicar la respuesta").click();
  await boton(page, "No quiero").click();
  await boton(page, "Repetir el ejemplo").click();
  await expect(page.getByRole("img", { name: "Muestra Sota de bastos", exact: true })).toBeVisible();
});

test("el aprendiz puede rechazar o querer el mismo truco y comprobar la salida rival", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("aprender/truco/");
  await boton(page, "Practicar la respuesta").click();
  await page.reload();
  await expect(titulo(page, "Te cantaron truco. ¿Querés?")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Jugar / })).toHaveCount(0);
  for (const texto of ["Quiero", "No quiero"]) {
    const caja = await boton(page, texto).boundingBox();
    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.x + caja.width).toBeLessThanOrEqual(320);
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
  await boton(page, "Jugar caballo de bastos").click();
  await boton(page, "Jugar 3 de oros").click();
  await expect(titulo(page, "Tu pareja cobra 2 tantos")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
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
