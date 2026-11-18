import { expect, test } from "@playwright/test";

// Solo fijamos la fuente de semillas. Cada mano pasa por el generador, la sesión y el evaluador reales.
async function semillas(page, ...valores) {
  await page.addInitScript((lista) => {
    let indice = 0;
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (datos) => {
      if (datos instanceof Uint32Array && datos.length === 1) {
        datos[0] = lista[indice++ % lista.length];
        return datos;
      }
      return original(datos);
    };
  }, valores);
}

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const enlace = (page, name) => page.getByRole("link", { name, exact: true });

async function empezarTema(page, id) {
  await page.goto("aprender/?tema=" + id);
  await expect(page.getByText("Ejemplo resuelto", { exact: true })).toBeVisible();
  await boton(page, "Probar con otra mano").click();
}

test("primeros cinco minutos, empate con teclado, flor y repaso tras recarga", async ({ page }) => {
  await semillas(page, 2, 3, 1);
  await page.goto("./");
  await enlace(page, "Practicar con las cartas").click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).locator('[aria-current="page"]')).toHaveText("Aprender");
  const imagenes = await page.locator(".ap-vineta img").evaluateAll((imagenes) => imagenes.map((img) => img.src));
  expect(new Set(imagenes).size).toBe(3);
  await enlace(page, "Empezar con un ejemplo").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Comparar dos cartas" })).toBeFocused();
  await expect(page.locator("#ejemplo-resuelto")).toContainText("as de espadas");
  await page.keyboard.press("Tab");
  await expect(boton(page, "Probar con otra mano")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "¿Qué carta gana la vuelta?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(boton(page, "3 de oros")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(boton(page, "Empatan")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toContainText("tienen la misma fuerza");

  await boton(page, "Seguir con reconocer flor").click();
  await expect(page.getByRole("heading", { level: 1, name: "Reconocer flor" })).toBeFocused();
  await boton(page, "Probar con otra mano").click();
  await boton(page, "Tengo flor").click();
  await boton(page, "Pedir una pista").click();
  await expect(page.getByRole("status")).toContainText("Apartá la pieza");
  await boton(page, "Sin flor").click();
  await expect(page.getByRole("status")).toContainText("palos distintos");
  await boton(page, "Seguir con práctica mixta").click();
  await expect(page).toHaveURL("aprender/?modo=mixta");
  await enlace(page, "Todos los temas").click();
  await page.reload();
  await expect(enlace(page, "Retomar práctica mixta")).toBeVisible();
  await expect(page.locator('[data-avance="comparar-cartas"]')).toContainText("1 mano resuelta");
  await expect(page.locator('[data-avance="reconocer-flor"]')).toContainText("0 manos resueltas");
  await expect(page.locator("#temas a[data-ruta]")).toHaveCount(6);
});

test("cuenta envido por pasos, con pista al error y mano nueva en el mismo tema", async ({ page }) => {
  await semillas(page, 0, 2);
  await empezarTema(page, "contar-envido");
  await expect(boton(page, "Confirmar cartas")).toBeDisabled();
  await expect(boton(page, "6 de bastos")).toBeVisible();
  for (const nombre of ["3 de copas", "2 de copas"]) {
    await boton(page, nombre).click();
    await expect(boton(page, nombre)).toHaveAttribute("aria-pressed", "true");
  }
  await boton(page, "Confirmar cartas").click();
  const total = page.getByRole("spinbutton", { name: "Tu total" });
  await expect(total).toBeFocused();
  await total.fill("5");
  await total.press("Enter");
  await expect(page.getByRole("status")).toContainText("20 de base");
  await total.press("Enter");
  await expect(page.getByRole("status")).toContainText("Contá los 20 de base una sola vez.");
  await total.fill("25");
  await total.press("Enter");
  await expect(page.getByRole("status")).toContainText("20 + 3 + 2 = 25");
  await boton(page, "Otra mano").click();
  await expect(boton(page, "4 de espadas")).toBeVisible();
  await page.getByText("Regla para esta mano", { exact: true }).click();
  await expect(enlace(page, "Leer el capítulo completo")).toHaveAttribute("href", /reglas\/envido\/$/);
  await enlace(page, "Leer el capítulo completo").click();
  await expect(page).toHaveURL("reglas/envido/");
});

for (const { semilla, selecciones, total, explicacion } of [
  {
    semilla: 3, selecciones: [["7 de oros"], ["7 de copas"]], total: 7,
    explicacion: "Contás una sola carta. Con el 7 de oros o el 7 de copas hacés 7 de envido.",
  },
  {
    semilla: 43, selecciones: [["Rey de copas"], ["Caballo de oros"], ["Sota de espadas"]], total: 0,
    explicacion: "Contás una sola carta. Con el rey de copas, el caballo de oros o la sota de espadas hacés 0 de envido.",
  },
  {
    semilla: 19, selecciones: [["5 de copas", "3 de oros"], ["5 de copas", "3 de bastos"]], total: 31,
    explicacion: "Podés combinar el 5 de copas con el 3 de oros o el 3 de bastos. En ambos casos sumás 28 + 3 = 31.",
  },
]) {
  for (const cartas of selecciones) {
    test(`explica las alternativas de envido al elegir ${cartas.join(" y ")}`, async ({ page }) => {
      await semillas(page, semilla);
      await empezarTema(page, "contar-envido");
      for (const nombre of cartas) await boton(page, nombre).click();
      await boton(page, "Confirmar cartas").click();
      await page.getByRole("spinbutton", { name: "Tu total" }).fill(String(total));
      await boton(page, "Comprobar total").click();
      await expect(page.getByRole("heading", { name: "Mano resuelta" })).toBeVisible();
      await expect(page.getByRole("status")).toHaveText("¡Bien! " + explicacion);
    });
  }
}

test("progreso aprendido sigue abierto y permite una selección vacía de piezas", async ({ page }) => {
  await semillas(page, 2, 1, 0);
  await empezarTema(page, "reconocer-piezas");
  await boton(page, "Rey de espadas").click();
  await boton(page, "5 de espadas").click();
  await boton(page, "Confirmar cartas").click();
  await expect(page.getByRole("status")).toContainText("sustituye");
  await boton(page, "Otra mano").click();
  await boton(page, "Ninguna es pieza").click();
  await expect(page.getByRole("status")).toContainText("Ninguna");
  await boton(page, "Otra mano").click();
  await boton(page, "4 de espadas").click();
  await boton(page, "Confirmar cartas").click();
  await expect(page.locator("#avance-actual")).toContainText("Aprendido · 3 manos");
  await boton(page, "Otra mano").click();
  await enlace(page, "Todos los temas").click();
  await page.reload();
  await expect(page.locator('[data-avance="reconocer-piezas"]')).toContainText("Aprendido · 3 manos");
});

test("flor con piezas en pantalla angosta y sin almacenamiento", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Deshabilitado"); } });
  });
  await semillas(page, 2);
  const imagenes = new Set();
  page.on("request", (req) => { if (req.url().includes("/img/cartas/tatu/")) imagenes.add(req.url()); });
  await page.goto("aprender/?tema=contar-flor");
  await expect(page.locator("#ejemplo-resuelto")).toContainText("20 + 9 + 7 + 3 = 39");
  await boton(page, "Probar con otra mano").click();
  for (const nombre of ["Caballo de espadas", "7 de oros", "4 de espadas"]) {
    const carta = boton(page, nombre);
    const caja = await carta.boundingBox();
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(320);
    expect(caja.width).toBeGreaterThanOrEqual(44);
    await carta.click();
  }
  await boton(page, "Confirmar cartas").click();
  await page.getByRole("spinbutton").fill("13");
  await boton(page, "Comprobar total").click();
  await boton(page, "Pedir una pista").click();
  await expect(page.getByRole("status")).toContainText("aporta 7");
  await page.getByRole("spinbutton").fill("43");
  await boton(page, "Comprobar total").click();
  await expect(page.getByRole("status")).toContainText("20 + 7 + 7 + 9 = 43");
  await enlace(page, "Todos los temas").click();
  await expect(enlace(page, "Retomar práctica mixta")).toBeVisible();
  expect(imagenes.size).toBeLessThanOrEqual(11);
});
