import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { versionModeloPractica, versionMotorPractica } from "../src/probabilidad/perfil.ts";

test("la portada carga una imagen principal WebP según el ancho de pantalla", async ({ page, isMobile }) => {
  await page.goto("./");
  const imagen = page.getByRole("img", { name: /^Grabado ilustrado de tres gauchos/ });
  await expect(imagen).toBeVisible();
  await expect(imagen).toHaveAttribute("fetchpriority", "high");
  const elegida = await imagen.evaluate(async (img) => {
    await img.decode();
    return img.srcset.split(",").map(candidato => candidato.trim().split(/\s+/))
      .find(([src]) => new URL(src, document.baseURI).href === img.currentSrc);
  });
  expect(elegida?.[0]).toMatch(/^\/_astro\/mesa-criolla\..+\.webp$/);
  expect(elegida?.[1]).toBe(isMobile ? "960w" : "768w");
});

test("del tema de la portada al último capítulo y sus fuentes", async ({ page }) => {
  await page.goto("./");
  const primary = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Inicio");
  await page.getByRole("link", { name: /Los cantos/ }).click();
  await expect(page).toHaveURL("reglas/#los-cantos");
  await expect(page.locator(":target").getByRole("heading", { level: 2 })).toHaveText("Los cantos");
  await page.getByRole("link", { name: /^La flor / }).click();
  await expect(page).toHaveURL("reglas/flor/");
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Reglas del Truco");

  const pager = page.getByRole("navigation", { name: "Recorrido del manual" });
  await pager.getByRole("link", { name: /Anterior/ }).click();
  await expect(page).toHaveURL("reglas/envido/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("reglas/flor/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("reglas/truco/");
  await pager.getByRole("link", { name: /Siguiente/ }).click();
  await expect(page).toHaveURL("fuentes/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fuentes y variantes");
  await expect(primary.locator('a[aria-current="page"]')).toHaveText("Fuentes");
  await primary.getByRole("link", { name: "Inicio" }).click();
  await expect(page).toHaveURL("./");
});

test("abre una variante de mesa y vuelve al capítulo que la explica", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Consultar variantes" }).click();
  await expect(page).toHaveURL("fuentes/#variantes");
  const variant = page.locator(":target details").filter({ hasText: "Quién puede echar los perros" });
  await variant.locator("summary").click();
  await variant.getByRole("link", { name: "Leer el capítulo" }).click();
  await expect(page).toHaveURL("reglas/truco/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Truco, retruco y vale cuatro");
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("todas las páginas identifican a El Truco en el sitio y en sus vistas previas", async ({ page }) => {
    const paginas = readdirSync("dist", { recursive: true }).filter(ruta => ruta.endsWith("index.html"));
    expect(paginas).toContain("index.html");
    for (const archivo of paginas) {
      const ruta = "/" + archivo.replace(/index\.html$/, "");
      await test.step(ruta, async () => {
        await page.goto(ruta, { waitUntil: "domcontentloaded" });
        const titulo = await page.title();
        if (ruta === "/") {
          expect(titulo).toBe("El Truco");
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("El Truco");
        } else {
          expect(titulo).toMatch(/^.+ · El Truco$/);
        }
        await expect(page.locator('meta[name="application-name"]')).toHaveAttribute("content", "El Truco");
        await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "El Truco");
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", titulo);
        await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", titulo);
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
        await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
        for (const zona of ["banner", "contentinfo"]) {
          const inicio = page.getByRole(zona).getByRole("link", { name: "El Truco, inicio" });
          await expect(inicio).toHaveText("El Truco");
          await expect(inicio).toHaveAttribute("href", "/");
          await expect(inicio.locator("img")).toHaveAttribute("src", "/favicon.svg");
        }
        await expect(page.locator("body")).not.toContainText("Truco Oriental");
      });
    }
  });

  test("las páginas de privacidad y eliminación se consultan sin cuenta", async ({ page }) => {
    await page.goto("./");
    const pie = page.getByRole("contentinfo").getByRole("navigation", { name: "Privacidad y datos" });
    await pie.getByRole("link", { name: "Política de privacidad" }).click();
    await expect(page).toHaveURL("privacidad/");
    const contenido = page.getByRole("main");
    await expect(contenido.getByRole("heading", { level: 1 })).toHaveText("Política de privacidad");
    await expect(contenido).toContainText("El ingreso con Facebook está pausado");
    await expect(contenido.getByRole("link", { name: "flabat@flabat.com" })).toHaveAttribute("href", "mailto:flabat@flabat.com");
    await contenido.getByRole("link", { name: "pedir la eliminación de tus datos" }).click();
    await expect(page).toHaveURL("eliminacion-de-datos/");
    await expect(contenido.getByRole("heading", { level: 1 })).toHaveText("Eliminación de datos");
    await expect(contenido).toContainText("Si ya quitaste El Truco de tus aplicaciones en Facebook");
    await expect(contenido.getByRole("link", { name: "flabat@flabat.com" })).toHaveAttribute("href", "mailto:flabat@flabat.com");
    await expect(pie.getByRole("link", { name: "Eliminación de datos" })).toHaveAttribute("href", "/eliminacion-de-datos/");
  });

  test("el pie de la guía y la práctica identifica las versiones locales", async ({ page }) => {
    const commit = process.env.TRUCO_RELEASE || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const pie = page.getByRole("contentinfo");
    for (const ruta of ["./", "aprender/mano/"]) {
      await page.goto(ruta);
      const enlace = pie.getByText("Interfaz", { exact: true }).locator("+ dd").getByRole("link");
      await expect(enlace).toBeVisible();
      await expect(enlace).toHaveText(commit.slice(0, 8));
      await expect(enlace).toHaveAttribute("href", `https://github.com/flabat/truco-uruguayo/commit/${commit}`);
      const motor = pie.getByText("Motor local", { exact: true }).locator("+ dd");
      await expect(motor).toBeVisible();
      await expect(motor).toHaveText(versionMotorPractica);
      const modelo = pie.getByText("Modelo local", { exact: true }).locator("+ dd");
      const resumen = modelo.locator("summary");
      await expect(resumen).toHaveText("Práctica v1 · Publicado el 18 nov 2026");
      await expect(resumen.locator("time")).toHaveAttribute("datetime", "2026-11-18");
      await expect(modelo.locator("code")).toBeHidden();
      await resumen.press("Enter");
      await expect(modelo.locator("code")).toBeVisible();
      await expect(modelo.locator("code")).toHaveText(versionModeloPractica);
    }
  });

  test("el enlace de búsqueda abre el índice y permite leer el primer capítulo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: "Buscar en la guía" }).click();
    await expect(page).toHaveURL("reglas/");
    await page.getByRole("link", { name: /^La mesa y el reparto / }).click();
    await expect(page).toHaveURL("reglas/preparacion/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("La mesa y el reparto");
    const pager = page.getByRole("navigation", { name: "Recorrido del manual" });
    await expect(pager.getByRole("link", { name: /Anterior/ })).toHaveCount(0);
    await pager.getByRole("link", { name: /Siguiente/ }).click();
    await expect(page).toHaveURL("reglas/jerarquia/");
  });
});
