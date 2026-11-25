// Desde el host, contra la web del stack descartable: la exportación web de la app en /app/ ingresa con la
// cookie, muestra el salón y el perfil, cierra la sesión y pide (y cancela) la eliminación.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const usuario = "luis";
const browser = await chromium.launch();
const espera = { timeout: 20_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });

async function jugador(p) {
  const r = await p.request.get("/api/jugador");
  return r.status() === 200 ? r.json() : null;
}

async function ingresar(p) {
  await expect(titulo(p, "Entrá a jugar")).toBeVisible(espera);
  // Sin la sesión de Keycloak del ingreso anterior, que pediría solo la contraseña.
  await p.context().clearCookies();
  await boton(p, "Ingresar").click();
  await ingresarDesdeIdentidad(p, usuario);
}

async function verPerfil(p, esperado) {
  await expect(titulo(p, "Mesas en juego")).toBeVisible(espera);
  await p.getByRole("link", { name: "Tu perfil" }).click();
  await expect(titulo(p, "Tu perfil")).toBeVisible(espera);
  await expect(p.getByText(esperado.nombre, { exact: true })).toBeVisible();
  await expect(p.getByText(esperado.id, { exact: true })).toBeVisible();
}

async function recorrer(viewport, completo) {
  const context = await browser.newContext({ baseURL: web, viewport });
  const p = await context.newPage();
  p.setDefaultTimeout(20_000);
  await p.goto("/app/");
  await ingresar(p);
  await p.waitForURL(url => url.pathname === "/app/");
  const yo = await jugador(p);
  assert.ok(yo?.id, "el ingreso desde /app/ deja la cookie de sesión");
  await verPerfil(p, yo);

  // El perfil, también al recargar su dirección; sin id, la mesa vuelve al salón.
  assert.equal(new URL(p.url()).pathname, "/app/perfil");
  await p.reload();
  await expect(titulo(p, "Tu perfil")).toBeVisible(espera);
  await p.goto("/app/mesa");
  await expect(titulo(p, "Mesas en juego")).toBeVisible(espera);
  await verPerfil(p, yo);

  await boton(p, "Cerrar sesión").click();
  await expect(titulo(p, "Entrá a jugar")).toBeVisible(espera);
  assert.equal(await jugador(p), null, "cerrar sesión borra la sesión del servidor");
  if (!completo) return context.close();

  // Eliminar la cuenta: la confirmación explica los 30 días y se puede cancelar.
  await ingresar(p);
  await verPerfil(p, yo);
  await boton(p, "Eliminar mi cuenta").click();
  const dialogo = p.getByRole("dialog", { name: "¿Eliminar tu cuenta?" });
  await expect(dialogo).toContainText("Tenés 30 días para arrepentirte");
  await boton(dialogo, "Cancelar").click();
  await expect(dialogo).toBeHidden();
  assert.equal((await jugador(p))?.id, yo.id, "cancelar no elimina nada");

  await boton(p, "Eliminar mi cuenta").click();
  await boton(dialogo, "Eliminar mi cuenta").click();
  await expect(p.getByRole("status")).toContainText("Pediste eliminar tu cuenta. Se borra el");
  await expect(titulo(p, "Entrá a jugar")).toBeVisible();
  assert.equal(await jugador(p), null, "la baja cierra la sesión");

  // Volver a ingresar dentro de los 30 días cancela la baja.
  await ingresar(p);
  await p.waitForURL(url => url.pathname === "/perfil/" && url.searchParams.get("baja") === "cancelada");
  await p.goto("/app/");
  await verPerfil(p, yo);
  await boton(p, "Cerrar sesión").click();
  await expect(titulo(p, "Entrá a jugar")).toBeVisible(espera);
  await context.close();
}

try {
  await recorrer({ width: 375, height: 760 }, true);
  await recorrer({ width: 1280, height: 800 }, false);
  console.log("App web verificada · ingreso con cookie, salón, perfil, cierre y eliminación de cuenta.");
} finally {
  await browser.close();
}
