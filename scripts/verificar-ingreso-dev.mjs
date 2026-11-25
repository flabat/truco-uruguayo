// Desde el host, contra la web del stack descartable (AUTH_DEV=1): el ingreso de prueba entrega el mismo jugador
// y el mismo tipo de sesión que el ingreso por Keycloak, en la web y en la app.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { ingresarConClaveLocal } from "./ingreso-local-navegador.mjs";

const [web, proyecto] = process.argv.slice(2);
const usuario = "luis";
const ruta = new URL("/api/auth/dev", web).href;
const sql = consulta => execFileSync("docker", ["compose", "--project-name", proyecto, "exec", "-T", "db",
  "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "truco", "-d", "truco", "-Atc", consulta], { encoding: "utf8" }).trim();
const hash = valor => createHash("sha256").update(valor).digest("hex");
const json = { "content-type": "application/json" };
/** Tipo de la sesión y días hasta que vence, redondeados. */
const sesion = handle => sql(`SELECT tipo || ' ' || round(extract(epoch FROM vence - now()) / 86400)
  FROM juego.sesiones WHERE clave='${hash(handle)}'`);
const jugadorCon = async headers => (await fetch(new URL("/api/jugador", web), { headers })).json();

const browser = await chromium.launch();
try {
  // La API anuncia el modo y los seis jugadores del realm local.
  const anuncio = await fetch(ruta);
  assert.equal(anuncio.status, 200);
  assert.deepEqual((await anuncio.json()).usuarios.map(u => u.usuario), ["ana", "bruno", "clara", "diego", "eva", "luis"]);

  // El jugador y la sesión del ingreso normal por Keycloak.
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto(web);
  await ingresarConClaveLocal(pagina, usuario);
  await pagina.waitForURL(url => url.pathname === "/" || url.pathname === "/jugar/");
  const normal = (await contexto.cookies()).find(c => c.name === "truco_sesion");
  const jugador = await (await pagina.request.get(new URL("/api/jugador", web).href)).json();
  await contexto.close();
  assert.equal(sesion(normal.value), "web 7");

  // En la web: el mismo jugador, una cookie con los mismos atributos y una sesión del mismo tipo y duración.
  const sinOrigen = await fetch(ruta, { method: "POST", headers: json, body: JSON.stringify({ usuario }) });
  assert.equal(sinOrigen.status, 403);
  const deWeb = await fetch(ruta, { method: "POST", headers: { ...json, origin: new URL(web).origin }, body: JSON.stringify({ usuario }) });
  assert.equal(deWeb.status, 200);
  const cookie = deWeb.headers.get("set-cookie");
  const handle = /^truco_sesion=([A-Za-z0-9_-]{43});/.exec(cookie)?.[1];
  assert.ok(handle, cookie);
  assert.equal(cookie.slice(cookie.indexOf(";")), "; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=604800");
  assert.equal(sesion(handle), "web 7");
  assert.deepEqual(await jugadorCon({ cookie: "truco_sesion=" + handle }), jugador);

  // En la app: un código que se canjea una vez, con el verificador, por una sesión de la app.
  const verificador = randomBytes(32).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  const deApp = await fetch(ruta, { method: "POST", headers: json, body: JSON.stringify({ usuario, app: desafio }) });
  assert.equal(deApp.status, 200);
  assert.equal(deApp.headers.get("set-cookie"), null);
  const { codigo } = await deApp.json();
  const canjear = () => fetch(new URL("/api/auth/canje", web), { method: "POST", headers: json, body: JSON.stringify({ codigo, verificador }) });
  const canje = await canjear();
  assert.equal(canje.status, 200);
  const datos = await canje.json();
  assert.deepEqual(datos.jugador, { id: jugador.id, nombre: jugador.nombre });
  assert.equal(sesion(datos.sesion), "app 30");
  assert.deepEqual(await jugadorCon({ authorization: "Bearer " + datos.sesion }), jugador);
  assert.equal((await canjear()).status, 401);

  // Un solo jugador: el ingreso de prueba no crea una cuenta paralela.
  assert.equal(sql(`SELECT count(*) FROM juego.jugadores WHERE sujeto='2e98a700-1205-4e9b-8161-000000000006'`), "1");
  console.log("Ingreso de prueba verificado · mismo jugador y sesión que Keycloak, en la web y en la app.");
} finally {
  await browser.close();
}
