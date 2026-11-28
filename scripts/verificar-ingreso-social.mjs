import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const [web, ...habilitados] = process.argv.slice(2);
const browser = await chromium.launch();
const ingreso = new URL("/api/auth/login", web).href;
// Sumas de los SVG oficiales de Apple que la imagen de Keycloak baja al construirse.
const sumasLogoApple = Object.fromEntries(
  readFileSync(new URL("../infra/keycloak/logo-apple.sha256", import.meta.url), "utf8")
    .trim().split("\n").map(linea => linea.split(/\s+/).reverse()),
);

// Sign in with Apple según las Human Interface Guidelines: logo oficial del alto del botón, título y logo
// del mismo color, negro sobre fondo claro y blanco sobre oscuro, y nunca más chico que los demás botones.
async function verificarApple(page, oscuro) {
  await expect(page.locator("html.pf-v5-theme-dark")).toHaveCount(oscuro ? 1 : 0);
  const boton = page.locator("#social-apple");
  const titulo = boton.locator("span");
  const [fondo, tinta] = oscuro ? ["rgb(255, 255, 255)", "rgb(0, 0, 0)"] : ["rgb(0, 0, 0)", "rgb(255, 255, 255)"];
  await expect(boton).toHaveCSS("background-color", fondo);
  await expect(titulo).toHaveCSS("color", tinta);
  assert.equal(await boton.evaluate(a => getComputedStyle(a, "::after").borderColor), fondo, "Sin borde gris alrededor de Apple.");

  const logo = boton.locator("img:visible");
  await expect(logo).toHaveCount(1);
  const archivo = oscuro ? "apple-negro.svg" : "apple-blanco.svg";
  const origen = await logo.evaluate(img => img.currentSrc);
  assert.ok(origen.endsWith("/img/social/" + archivo), origen);
  assert.ok(await logo.evaluate(img => img.complete && img.naturalWidth > 0), "El logo de Apple debe cargar.");
  const svg = await page.request.get(origen);
  assert.equal(svg.headers()["content-type"], "image/svg+xml");
  assert.equal(createHash("sha256").update(await svg.body()).digest("hex"), sumasLogoApple[archivo]);

  const caja = await boton.boundingBox();
  const cajaLogo = await logo.boundingBox();
  const cajaTitulo = await titulo.boundingBox();
  assert.ok(Math.abs(cajaLogo.height - caja.height) < 0.5 && Math.abs(cajaLogo.y - caja.y) < 0.5,
    "El logo debe medir lo mismo que el botón, sin relleno vertical.");
  assert.ok(caja.width >= 140 && caja.height >= 30);
  const proporcion = parseFloat(await titulo.evaluate(span => getComputedStyle(span).fontSize)) / caja.height;
  assert.ok(proporcion > 0.41 && proporcion < 0.45, `El título mide ${proporcion} del alto; Apple usa 0.43.`);
  assert.ok(caja.x + caja.width - (cajaTitulo.x + cajaTitulo.width) >= 0.08 * caja.width,
    "El margen derecho del título debe ser al menos el 8 % del ancho.");
  const otro = page.locator("#kc-social-providers a[id^='social-']:not(#social-apple)").first();
  const cajaOtro = await otro.boundingBox();
  assert.ok(Math.abs(caja.height - cajaOtro.height) < 0.5 && Math.abs(caja.width - cajaOtro.width) < 0.5,
    "Apple debe medir lo mismo que los demás botones.");
  const radio = elemento => elemento.evaluate(a => getComputedStyle(a).borderRadius);
  assert.equal(await radio(boton), await radio(otro));

  // El borde de foco de PatternFly toma el color del botón: sobre negro tiene que verse un contorno.
  await page.locator("#login-select-toggle").focus();
  await page.keyboard.press("Tab");
  await expect(boton).toBeFocused();
  assert.notEqual(await boton.evaluate(a => getComputedStyle(a).outlineStyle), "none");
  assert.notEqual(await boton.evaluate(a => getComputedStyle(a).outlineColor), fondo);
}

async function verificarMarca(page) {
  await expect(page).toHaveTitle(/El Truco/);
  await expect(page.locator("#kc-header-wrapper")).toHaveText("El Truco");
  const icono = await page.locator('link[rel="icon"]').evaluate(link => link.href);
  const [iconoIngreso, iconoSitio] = await Promise.all([
    page.request.get(icono),
    page.request.get(new URL("/favicon.svg", web).href),
  ]);
  assert.ok(iconoIngreso.ok() && iconoSitio.ok());
  assert.equal(iconoIngreso.headers()["content-type"], "image/svg+xml");
  assert.deepEqual(await iconoIngreso.body(), await iconoSitio.body());
}

async function verificarOrdenYClaveLocal(viewport, locale) {
  const page = await browser.newPage({ viewport, locale });
  await page.goto(ingreso);
  await verificarMarca(page);
  const proveedores = page.locator("#kc-social-providers a[id^='social-']");
  const introduccion = page.locator("#truco-social-intro");
  const cuentaLocal = page.locator("#truco-existing-account");
  const usuario = page.locator("#username");
  await expect(proveedores).toHaveCount(habilitados.length);
  await expect(page.locator("#kc-registration a")).toBeVisible();
  if (habilitados.length === 0) {
    await expect(introduccion).toHaveCount(0);
    await expect(cuentaLocal).toHaveCount(0);
    await expect(usuario).toBeVisible();
    await expect(page.locator("#kc-login")).toBeVisible();
  } else {
    await expect(introduccion).toContainText(locale === "es" ? "crear tu jugador" : "join the game");
    for (const nombre of ["Google", "Facebook", "Discord", "Apple"].filter(nombre => habilitados.includes(nombre.toLowerCase()))) {
      const boton = page.locator("#social-" + nombre.toLowerCase());
      const etiqueta = (locale === "es" ? "Continuar con " : "Continue with ") + nombre;
      await expect(boton).toHaveText(etiqueta);
      await expect(boton).toHaveAccessibleName(etiqueta);
    }
    if (habilitados.includes("apple")) await expect(proveedores.first()).toHaveId("social-apple");
    const resumen = cuentaLocal.locator("summary");
    await expect(resumen).toBeVisible();
    await expect(usuario).toBeHidden();
    const posicionResumen = await resumen.boundingBox();
    for (const proveedor of await proveedores.all()) {
      await expect(proveedor).toBeInViewport();
      const posicion = await proveedor.boundingBox();
      assert.ok(posicion.y + posicion.height <= posicionResumen.y, "El ingreso social debe preceder al ingreso con clave.");
    }
    // El único control anterior a los proveedores es el selector de idioma.
    await page.keyboard.press("Tab");
    await expect(page.locator("#login-select-toggle")).toBeFocused();
    await page.keyboard.press("Tab");
    for (const proveedor of await proveedores.all()) {
      await expect(proveedor).toBeFocused();
      await page.keyboard.press("Tab");
    }
    await expect(resumen).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(usuario).toBeFocused();

    await usuario.fill("jugador-inexistente-de-prueba");
    await page.locator("#password").fill("clave-incorrecta");
    await page.locator("#kc-login").click();
    await expect(page.locator("#input-error-username")).toBeVisible();
    await expect(cuentaLocal).toHaveJSProperty("open", true);
    await expect(usuario).toBeVisible();
  }
  await page.close();
}

try {
  await verificarOrdenYClaveLocal({ width: 1280, height: 800 }, "es");
  await verificarOrdenYClaveLocal({ width: 375, height: 760 }, "en");
  if (habilitados.includes("apple")) {
    for (const [viewport, locale, colorScheme] of [
      [{ width: 1280, height: 800 }, "es", "light"],
      [{ width: 375, height: 760 }, "en", "light"],
      [{ width: 375, height: 760 }, "en", "dark"],
    ]) {
      const pagina = await browser.newPage({ viewport, locale, colorScheme });
      await pagina.goto(ingreso);
      await verificarApple(pagina, colorScheme === "dark");
      await pagina.close();
    }
  }
  const page = await browser.newPage();
  await page.goto(ingreso);
  const issuer = new URL("/realms/mesa-local/", page.url());
  for (const [proveedor, dominio, clientId] of [
    ["google", "accounts.google.com", process.env.GOOGLE_CLIENT_ID],
    ["facebook", "graph.facebook.com", process.env.FACEBOOK_APP_ID],
    ["discord", "discord.com", process.env.DISCORD_CLIENT_ID],
    ["apple", "appleid.apple.com", process.env.APPLE_CLIENT_ID],
  ]) {
    const boton = page.locator("#social-" + proveedor);
    if (!habilitados.includes(proveedor)) {
      await expect(boton).toHaveCount(0);
      continue;
    }
    await expect(boton).toBeVisible();
    // Seguimos el enlace con las cookies del navegador hasta el primer salto externo.
    const enlace = new URL(await boton.getAttribute("href"), page.url());
    const salida = await page.request.get(enlace.href, { maxRedirects: 0 });
    assert.ok([302, 303].includes(salida.status()));
    const destino = new URL(salida.headers().location);
    assert.equal(destino.origin, "https://" + dominio);
    assert.equal(destino.searchParams.get("client_id"), clientId);
    if (proveedor === "google") assert.equal(destino.searchParams.get("prompt"), "select_account");
    if (proveedor === "apple") {
      assert.equal(destino.searchParams.get("response_mode"), "form_post");
      const alcances = destino.searchParams.get("scope").split(" ");
      assert.ok(alcances.includes("name") && alcances.includes("email"), alcances.join(" "));
    }
    if (proveedor === "discord") {
      assert.equal(destino.searchParams.get("prompt"), "consent");
      assert.equal(destino.searchParams.get("scope"), "identify email");
    }
    assert.equal(destino.searchParams.get("redirect_uri"), new URL("broker/" + proveedor + "/endpoint", issuer).href);
    assert.ok(destino.searchParams.get("state"));
    await page.goto(ingreso);
  }
  if (habilitados.length === 2) {
    const correo = "registro-" + randomUUID() + "@example.test";
    const clave = "Clave-descartable-407!";
    await page.goto(new URL("/perfil/", web).href);
    assert.equal((await page.request.get(new URL("/api/perfil", web).href)).status(), 401);
    await page.getByRole("button", { name: "Ingresar al juego", exact: true }).click();
    await page.locator("#kc-registration a").click();
    await verificarMarca(page);
    await expect(page.locator("#username")).toHaveCount(0);
    await page.locator("#firstName").fill("Alicia");
    await page.locator("#lastName").fill("Prueba");
    await page.locator("#email").fill(correo);
    await page.locator("#password").fill(clave);
    await page.locator("#password-confirm").fill(clave);
    await page.locator("#kc-register-form input[type=submit], #kc-register-form button[type=submit]").click();
    await expect(page).toHaveURL(url => url.pathname === "/perfil/");
    await expect(page.getByText("Alicia", { exact: true })).toBeVisible();
    await expect(page.getByText("Todavía no jugaste ninguna partida.")).toBeVisible();
    const perfil = new URL("/api/perfil", page.url()).href;
    const primero = await (await page.request.get(perfil)).json();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();

    const otraPagina = await browser.newPage();
    await otraPagina.goto(ingreso);
    await otraPagina.locator("#truco-existing-account summary").click();
    await otraPagina.locator("#username").fill(correo);
    await otraPagina.locator("#password").fill(clave);
    await otraPagina.locator("#kc-login").click();
    await expect(otraPagina.getByRole("link", { name: "Mi perfil" })).toBeVisible();
    assert.deepEqual((await (await otraPagina.request.get(perfil)).json()).jugador, primero.jugador);
    await otraPagina.close();
  }
  console.log("Proveedores de la pantalla de ingreso verificados:", habilitados.join(", ") || "solo cuenta local");
} finally {
  await browser.close();
}
