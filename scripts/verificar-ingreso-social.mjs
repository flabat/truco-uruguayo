import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const [web, ...habilitados] = process.argv.slice(2);
const browser = await chromium.launch();
const ingreso = new URL("/api/auth/login", web).href;

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
    for (const nombre of ["Google", "Facebook", "Discord"].filter(nombre => habilitados.includes(nombre.toLowerCase()))) {
      const boton = page.locator("#social-" + nombre.toLowerCase());
      const etiqueta = (locale === "es" ? "Continuar con " : "Sign in with ") + nombre;
      await expect(boton).toHaveText(etiqueta);
      await expect(boton).toHaveAccessibleName(etiqueta);
    }
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
  const page = await browser.newPage();
  await page.goto(ingreso);
  const issuer = new URL("/realms/mesa-local/", page.url());
  for (const [proveedor, dominio, clientId] of [
    ["google", "accounts.google.com", process.env.GOOGLE_CLIENT_ID],
    ["facebook", "graph.facebook.com", process.env.FACEBOOK_APP_ID],
    ["discord", "discord.com", process.env.DISCORD_CLIENT_ID],
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
