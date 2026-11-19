import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const [web, ...habilitados] = process.argv.slice(2);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL("/api/auth/login", web).href);
  await expect(page.locator("#kc-login")).toBeVisible();
  const issuer = new URL("/realms/mesa-local/", page.url());
  for (const [proveedor, dominio, clientId] of [
    ["google", "accounts.google.com", process.env.GOOGLE_CLIENT_ID],
    ["facebook", "graph.facebook.com", process.env.FACEBOOK_APP_ID],
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
    assert.equal(destino.searchParams.get("redirect_uri"), new URL("broker/" + proveedor + "/endpoint", issuer).href);
    assert.ok(destino.searchParams.get("state"));
    await page.goto(new URL("/api/auth/login", web).href);
  }
  console.log("Proveedores de la pantalla de ingreso verificados:", habilitados.join(", ") || "solo cuenta local");
} finally {
  await browser.close();
}
