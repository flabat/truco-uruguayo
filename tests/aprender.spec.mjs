import { expect, test } from "@playwright/test";
import { temas } from "../src/aprendizaje/lecciones/index.ts";
import { claveSituacion } from "../src/aprendizaje/generadores/index.ts";
import { cartasPorId } from "../src/lib/cartas.ts";
import { explicarSituacion } from "../src/aprendizaje/generadores/evaluacion.ts";
import { paloDe } from "../src/motor/cartas.ts";

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
  await boton(page, "Ir a practicar").click();
}

async function comprobarEjemplo(page, tema, ejemplo, explicacion = ejemplo.detalle) {
  const { muestra, cartas } = ejemplo;
  await expect(page.getByRole("img", { name: "Muestra " + cartasPorId.get(muestra).nombre })).toBeVisible();
  await expect(page.locator("#cartas-mano .ap-carta")).toHaveText(cartas.map((id) => cartasPorId.get(id).nombre));
  await expect(page.locator("#ejemplo-resuelto")).toContainText(explicacion);
  if (tema.pasos.some((paso) => paso.tipo === "responder-total")) {
    await expect(page.locator("#ejemplo-resuelto strong")).toHaveText(explicarSituacion(tema.habilidad, cartas, muestra));
  }
  expect(await page.evaluate(() => history.state.ejemplo.id)).toBe(ejemplo.id);
}

const elegirTema = (page, tema) => page.locator(`#temas a[href="?tema=${tema.id}"]`).click();

for (const [indice, azar] of [0, 0.99].entries()) {
  test(`primera visita muestra la apertura ${indice + 1} de cada tema con sus cartas y explicación`, async ({ page }) => {
    await page.addInitScript((valor) => { Math.random = () => valor; }, azar);
    for (const tema of temas) {
      await page.goto("aprender/?tema=" + tema.id);
      await comprobarEjemplo(page, tema, tema.ejemplos[indice]);
    }
  });
}

test("primeros cinco minutos, empate con teclado, flor y repaso tras recarga", async ({ page }) => {
  await semillas(page, 2, 3, 1);
  await page.goto("./");
  await enlace(page, "Practicar con las cartas").click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).locator('[aria-current="page"]')).toHaveText("Aprender");
  const imagenes = await page.locator(".ap-vineta img").evaluateAll((imagenes) => imagenes.map((img) => img.src));
  expect(imagenes.map((src) => src.split("/").at(-1)).sort()).toEqual([
    "bastos-02.webp", "bastos-06.webp", "espadas-01.webp", "reverso.webp",
  ]);
  await enlace(page, "Empezar con un ejemplo").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Comparar dos cartas" })).toBeFocused();
  await expect(page.locator("#ejemplo-resuelto")).toContainText("as de espadas");
  await page.keyboard.press("Tab");
  await expect(boton(page, "Ir a practicar")).toBeFocused();
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
  await expect(boton(page, "Repetir demostración")).toBeHidden();
  await boton(page, "Ir a practicar").click();
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
  await page.locator("summary").filter({ hasText: "Regla para esta mano" }).click();
  await expect(enlace(page, "Leer el capítulo completo en otra pestaña")).toHaveAttribute("href", /reglas\/envido\/$/);
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
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("aprender/?tema=contar-flor");
  const tema = temas.find(({ id }) => id === "contar-flor");
  await comprobarEjemplo(page, tema, tema.ejemplos[0]);
  await boton(page, "Ver otro ejemplo").click();
  await comprobarEjemplo(page, tema, tema.ejemplos[1]);
  await enlace(page, "Todos los temas").click();
  await elegirTema(page, tema);
  await comprobarEjemplo(page, tema, tema.ejemplos[2]);
  await page.reload();
  await comprobarEjemplo(page, tema, tema.ejemplos[2]);
  await boton(page, "Ir a practicar").click();
  const cartasPractica = await page.locator("#carta-muestra .frente, #cartas-mano img").evaluateAll((imgs) =>
    imgs.map((img) => img.src.split("/").at(-1).replace(".webp", "")));
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
  const esperadas = new Set([
    "reverso", "bastos-02", "espadas-01", "bastos-06", // Viñeta del índice.
    ...tema.ejemplos.flatMap(({ muestra, cartas }) => [muestra, ...cartas]),
    ...cartasPractica,
  ]);
  for (const src of imagenes) expect(esperadas.has(src.split("/").at(-1).replace(".webp", ""))).toBe(true);
});

test("los cinco temas recorren tres ejemplos sin crédito y permiten practicar con una sola acción", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: 812 });
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("aprender/");
  for (const tema of temas) {
    await elegirTema(page, tema);
    const practicar = boton(page, "Ir a practicar");
    const otro = boton(page, "Ver otro ejemplo");
    for (const ejemplo of tema.ejemplos) {
      await comprobarEjemplo(page, tema, ejemplo);
      await expect(boton(page, "Repetir demostración")).toBeHidden();
      await expect(page.locator("#avance-actual")).toHaveText("Sin practicar");
      const nombres = await page.getByRole("group", { name: /Cartas de la/ }).ariaSnapshot();
      for (const id of ejemplo.cartas) expect(nombres).toContain(cartasPorId.get(id).nombre);
      await page.keyboard.press("Tab");
      await expect(practicar).toBeFocused();
      // El foco puede desplazar la página entre dos lecturas de coordenadas.
      const { finBoton, inicioMesa } = await practicar.evaluate(boton => ({
        finBoton: boton.getBoundingClientRect().bottom,
        inicioMesa: document.querySelector(".ap-mesa").getBoundingClientRect().top,
      }));
      expect(finBoton).toBeLessThanOrEqual(inicioMesa);
      await page.keyboard.press("Tab");
      await expect(otro).toBeFocused();
      for (const control of [otro, practicar]) {
        const { x, width, height } = await control.boundingBox();
        expect(height).toBeGreaterThanOrEqual(44);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(page.viewportSize().width);
      }
      await page.keyboard.press("Enter");
      await expect(page.locator("#consigna")).toBeFocused();
    }
    await comprobarEjemplo(page, tema, tema.ejemplos[0]);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("#consigna")).toBeFocused();
    await expect(page.locator("#etapa")).toContainText("Tu turno");
    const casos = await page.evaluate((id) =>
      JSON.parse(localStorage.getItem("truco-oriental.aprendizaje")).habilidades.find((h) => h.habilidad === id).casos, tema.habilidad);
    expect(casos).toHaveLength(1);
    const editoriales = tema.ejemplos.map(({ muestra, cartas }) => claveSituacion(muestra, cartas));
    expect(editoriales).not.toContain(casos[0].clave);
    await enlace(page, "Todos los temas").click();
  }
});

test("elegir desde la lista o en otra pestaña avanza el ciclo. Recarga, Atrás y Adelante restauran la entrada", async ({ page, context }) => {
  await context.addInitScript(() => { Math.random = () => 0; });
  const tema = temas.find(({ id }) => id === "reconocer-piezas");
  const [a, b, c] = tema.ejemplos;
  await page.goto("aprender/");
  await elegirTema(page, tema);
  await comprobarEjemplo(page, tema, a);
  await enlace(page, "Todos los temas").click();
  await elegirTema(page, tema);
  await comprobarEjemplo(page, tema, b);
  const otra = await context.newPage();
  await otra.goto(page.url());
  await comprobarEjemplo(otra, tema, c);
  await otra.close();
  await page.reload();
  await comprobarEjemplo(page, tema, b);
  await page.goBack();
  await expect(page.locator(`[data-avance="${tema.id}"]`)).toHaveText("Sin practicar");
  await page.goBack();
  await comprobarEjemplo(page, tema, a);
  await page.goForward();
  await page.goForward();
  await comprobarEjemplo(page, tema, b);
  await boton(page, "Ver otro ejemplo").click();
  await comprobarEjemplo(page, tema, a);
  await enlace(page, "Todos los temas").click();
  await page.goBack();
  await comprobarEjemplo(page, tema, a);
  await page.goForward();
  await elegirTema(page, tema);
  await comprobarEjemplo(page, tema, b);
  expect(await page.evaluate(() => localStorage.getItem("truco-oriental.aprendizaje"))).toBeNull();
});

test("el progreso V1 sobrevive a historial de ejemplos ausente, JSON roto e IDs retirados", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  const [comparar, flor, piezas] = temas;
  await page.goto("aprender/");
  const previo = JSON.stringify({ version: 1, habilidades: [{ habilidad: comparar.habilidad,
    casos: [{ clave: "anterior", familia: comparar.familias[0], acreditado: true }],
    recientes: ["anterior"], ultimosResultados: [true] }] });
  await page.evaluate((previo) => {
    localStorage.setItem("truco-oriental.aprendizaje", previo);
    localStorage.setItem("truco-oriental.ejemplos.v1.reconocer-flor", "{");
    localStorage.setItem("truco-oriental.ejemplos.v1.reconocer-piezas", JSON.stringify(["retirado", "dos-cincos"]));
  }, previo);
  await page.reload();
  await elegirTema(page, comparar);
  await comprobarEjemplo(page, comparar, comparar.ejemplos[0]);
  await page.locator(".ap-consulta summary").click();
  await boton(page, "Ver otro ejemplo").click();
  await expect(page.locator("#avance-actual")).toContainText("1 mano resuelta sin ayuda");
  await enlace(page, "Todos los temas").click();
  await elegirTema(page, flor);
  await comprobarEjemplo(page, flor, flor.ejemplos[0]);
  await enlace(page, "Todos los temas").click();
  await elegirTema(page, piezas);
  await comprobarEjemplo(page, piezas, piezas.ejemplos[1]);
  await page.evaluate(() => history.replaceState({ ejemplo: { ...history.state.ejemplo, id: "retirado" } }, ""));
  await page.reload();
  await comprobarEjemplo(page, piezas, piezas.ejemplos[2]);
  expect(await page.evaluate(() => localStorage.getItem("truco-oriental.aprendizaje"))).toBe(previo);
});

test("la entrada inicial y mixta usan el mismo ciclo que cada tema y restauran su paso", async ({ page }) => {
  const [comparar, flor] = temas;
  await semillas(page, 2);
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto("aprender/");
  await elegirTema(page, comparar);
  await enlace(page, "Todos los temas").click();
  await enlace(page, "Empezar con un ejemplo").click();
  const apertura = comparar.ejemplos[1];
  await comprobarEjemplo(page, comparar, apertura, explicarSituacion(comparar.habilidad, apertura.cartas, apertura.muestra));
  await boton(page, "Ir a practicar").click();
  await boton(page, "Empatan").click();
  await boton(page, "Seguir con reconocer flor").click();
  await comprobarEjemplo(page, flor, flor.ejemplos[0]);
  await page.reload();
  await expect(page.locator("#modo")).toContainText("2 de 2");
  await comprobarEjemplo(page, flor, flor.ejemplos[0]);
  await enlace(page, "Todos los temas").click();
  await enlace(page, "Retomar práctica mixta").click();
  await comprobarEjemplo(page, flor, flor.ejemplos[1]);
  await boton(page, "Ver otro ejemplo").click();
  await page.reload();
  await comprobarEjemplo(page, flor, flor.ejemplos[2]);
  await boton(page, "Ir a practicar").click();
  await boton(page, "Tengo flor").click();
  await boton(page, "Otra mano").click();
  await expect(page.locator("#modo")).toHaveText("Práctica mixta");
  await expect(page.locator("#titulo-practica")).toHaveText(comparar.titulo);
  await expect(page.locator("#etapa")).toContainText("Tu turno");
});

test("saltar al contenido conserva el ejemplo o el desafío activo", async ({ page }) => {
  const [tema] = temas;
  await page.addInitScript(() => { Math.random = () => 0; });
  const saltar = enlace(page, "Saltar al contenido");
  await page.goto("aprender/?tema=" + tema.id);
  await saltar.press("Enter");
  await comprobarEjemplo(page, tema, tema.ejemplos[0]);
  await page.reload();
  await comprobarEjemplo(page, tema, tema.ejemplos[0]);
  await page.goBack();
  await boton(page, "Ir a practicar").click();
  const cartas = await page.locator("#cartas-mano .ap-carta").allTextContents();
  await saltar.press("Enter");
  await expect(page.locator("#etapa")).toContainText("Tu turno");
  await expect(page.locator("#cartas-mano .ap-carta")).toHaveText(cartas);
});

async function abrirDemostracion(page, dimensiones) {
  await page.setViewportSize(dimensiones);
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
  await page.goto("aprender/?modo=inicio");
}

test("la demostración señala la muestra, elige ambas ganadoras y enseña Empatan", async ({ page, isMobile }) => {
  await abrirDemostracion(page, { width: isMobile ? 320 : 1280, height: 812 });
  const [tema] = temas;
  const repetir = boton(page, "Repetir demostración");
  const practicar = boton(page, "Ir a practicar");
  const objetivo = page.locator(".ap-ejercicio .ap-elegida");
  const panel = page.locator(".ap-ejercicio");
  const gesto = page.locator(".ap-gesto");
  const mesa = page.locator(".ap-mesa");
  for (const [i, caso] of tema.ejemplos.entries()) {
    const esperada = ["2 de bastos", "4 de oros", "Empatan"][i];
    const explicacion = explicarSituacion(tema.habilidad, caso.cartas, caso.muestra);
    await comprobarEjemplo(page, tema, caso, explicacion);
    await mesa.scrollIntoViewIfNeeded();
    await expect(panel).toHaveAttribute("data-demostracion", "muestra");
    await expect(page.locator("#ejemplo-resuelto strong")).toContainText(paloDe(caso.muestra));
    await expect(page.locator("#carta-muestra .frente")).toHaveCSS("outline-style", "solid");
    await expect(page.locator("#ejemplo-resuelto > span")).toBeHidden();
    await page.clock.runFor(1500);
    await expect(gesto).toBeVisible();
    const destino = gesto.locator("..");
    await expect(destino).toHaveText(esperada);
    await expect(page.locator("#carta-muestra")).toBeInViewport({ ratio: 0.9 });
    await expect(gesto).toBeInViewport({ ratio: 0.9 });
    for (const elemento of [page.locator("#carta-muestra"), ...await page.locator("#cartas-mano .ap-carta").all(),
      gesto, destino, practicar, repetir, boton(page, "Ver otro ejemplo")]) {
      const caja = await elemento.boundingBox();
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    await page.clock.runFor(1200);
    await expect(objetivo).toHaveText(esperada);
    await expect(gesto).toBeHidden();
    await expect(page.locator("#ejemplo-resuelto > span")).toBeVisible();
    await expect(page.locator("#ejemplo-resuelto > span")).toHaveText(explicacion);

    await page.keyboard.press("Tab");
    await expect(practicar).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(repetir).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toHaveAttribute("data-demostracion", "muestra");
    await page.clock.runFor(3000);
    await expect(repetir).toBeFocused();
    await expect(objetivo).toHaveText(esperada);
    expect(await page.evaluate(() => history.state.ejemplo.id)).toBe(caso.id);
    await page.keyboard.press("Tab");
    await expect(boton(page, "Ver otro ejemplo")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#consigna")).toBeFocused();
  }
  await enlace(page, "Todos los temas").click();
  await expect(page.locator('[data-avance="comparar-cartas"]')).toHaveText("Sin practicar");
  expect(await page.evaluate(() => localStorage.getItem("truco-oriental.aprendizaje"))).toBeNull();
});

test("practicar a mitad del gesto reparte una sola mano y leer después conserva el acierto", async ({ page }) => {
  await semillas(page, 2);
  await abrirDemostracion(page, { width: 320, height: 740 });
  const mesa = page.locator(".ap-mesa");
  await mesa.scrollIntoViewIfNeeded();
  await expect(page.locator(".ap-ejercicio")).toHaveAttribute("data-demostracion", "muestra");
  await page.clock.runFor(1500);
  await expect(page.locator(".ap-gesto")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(boton(page, "Ir a practicar")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#consigna")).toBeFocused();
  await page.clock.runFor(5000);
  await expect(page.locator("#etapa")).toContainText("Tu turno");
  await expect(page.locator("[data-demostracion], .ap-gesto, .ap-elegida")).toHaveCount(0);
  await expect(page.locator("#ejemplo-resuelto")).toBeHidden();
  await boton(page, "Empatan").click();
  const progreso = () => page.evaluate(() => localStorage.getItem("truco-oriental.aprendizaje"));
  const conAcierto = await progreso();
  const casos = JSON.parse(conAcierto).habilidades[0].casos;
  expect(casos).toHaveLength(1);
  expect(casos[0].acreditado).toBe(true);
  expect(temas[0].ejemplos.map(({ muestra, cartas }) => claveSituacion(muestra, cartas))).not.toContain(casos[0].clave);

  await enlace(page, "Todos los temas").click();
  await enlace(page, "Volver a los primeros cinco minutos").click();
  await boton(page, "Repetir demostración").click();
  await boton(page, "Ver otro ejemplo").click();
  const id = await page.evaluate(() => history.state.ejemplo.id);
  await page.reload();
  expect(await page.evaluate(() => history.state.ejemplo.id)).toBe(id);
  await boton(page, "Repetir demostración").click();
  await page.goBack();
  await page.clock.runFor(4000);
  await expect(page.locator("[data-demostracion]")).toHaveCount(0);
  await expect(page.locator('[data-avance="comparar-cartas"]')).toContainText("1 mano resuelta sin ayuda");
  await page.goForward();
  expect(await page.evaluate(() => history.state.ejemplo.id)).toBe(id);
  const caso = temas[0].ejemplos.find((caso) => caso.id === id);
  await comprobarEjemplo(page, temas[0], caso, explicarSituacion(temas[0].habilidad, caso.cartas, caso.muestra));
  expect(await progreso()).toBe(conAcierto);
});

test("espera al tapete y no se relanza al volver a desplazarlo", async ({ page }) => {
  await abrirDemostracion(page, { width: 320, height: 220 });
  const panel = page.locator(".ap-ejercicio");
  const mesa = page.locator(".ap-mesa");
  await page.clock.runFor(4000);
  await expect(panel).toHaveAttribute("data-demostracion", "espera");
  await expect(boton(page, "Ir a practicar")).toBeEnabled();
  await mesa.scrollIntoViewIfNeeded();
  await expect(panel).toHaveAttribute("data-demostracion", "muestra");
  await page.clock.runFor(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(mesa).not.toBeInViewport();
  await mesa.scrollIntoViewIfNeeded();
  await expect(mesa).toBeInViewport();
  await expect(panel).toHaveAttribute("data-demostracion", "resultado");

  await boton(page, "Repetir demostración").click();
  await page.clock.runFor(1800);
  await boton(page, "Ver otro ejemplo").click();
  await mesa.scrollIntoViewIfNeeded();
  await expect(panel).toHaveAttribute("data-demostracion", "muestra");
  await page.clock.runFor(800); // Vencería el temporizador del ejemplo anterior.
  await expect(panel).toHaveAttribute("data-demostracion", "muestra");
  await page.clock.runFor(2000);
  await expect(page.locator(".ap-elegida")).toHaveText("4 de oros");
});

test("movimiento reducido presenta la elección y su explicación de inmediato", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abrirDemostracion(page, { width: 320, height: 700 });
  for (const caso of temas[0].ejemplos) {
    const explicacion = explicarSituacion(temas[0].habilidad, caso.cartas, caso.muestra);
    await comprobarEjemplo(page, temas[0], caso, explicacion);
    await expect(page.locator(".ap-ejercicio")).toHaveAttribute("data-demostracion", "resultado");
    await expect(page.locator("#ejemplo-resuelto > span")).toBeVisible();
    await expect(page.locator(".ap-elegida")).toBeVisible();
    await boton(page, "Repetir demostración").press("Enter");
    await expect(page.locator(".ap-gesto")).toBeHidden();
    await expect(page.locator("#ejemplo-resuelto > span")).toBeVisible();
    await boton(page, "Ver otro ejemplo").click();
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await boton(page, "Repetir demostración").click();
  await expect(page.locator(".ap-ejercicio")).toHaveAttribute("data-demostracion", "muestra");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ap-ejercicio")).toHaveAttribute("data-demostracion", "resultado");
});
