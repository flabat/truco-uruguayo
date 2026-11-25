import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { esDesafio, esRetornoLocal, verificadorCorresponde } from "../../api/sesion.ts";
import {
  cookieHaciaProxy, cookieSesion, destinoDespuesDelIngreso, encabezadosHaciaApi, esDeLaApi, leerArgumentosWeb, leerCookie,
  locationHaciaProxy, origenApi, parPkce, puertoAppWeb, RETORNO_LOCAL, rutaSinBase, urlIngreso,
} from "../../scripts/app-web-opciones.ts";

const vps = new URL("https://eltru.co");
const proxy = new URL("http://localhost:8083");

test("app:web elige la API por perfil, eltru.co si no se indica", () => {
  assert.deepEqual(leerArgumentosWeb([]), { api: "vps" });
  assert.deepEqual(leerArgumentosWeb(["--api", "local"]), { api: "local" });
  assert.deepEqual(leerArgumentosWeb(["--api=vps"]), { api: "vps" });
  assert.throws(() => leerArgumentosWeb(["--api", "prod"]), /Perfil de API desconocido/);
  assert.throws(() => leerArgumentosWeb(["ios"]), /Argumento desconocido/);
  assert.equal(origenApi("vps", {}), "https://eltru.co");
  assert.equal(origenApi("local", {}), "http://localhost:8081");
  assert.equal(origenApi("local", { WEB_PORT: "8101" }), "http://localhost:8101");
});

test("app:web escucha en APP_WEB_PORT o en el 8083", () => {
  assert.equal(puertoAppWeb({}), 8083);
  assert.equal(puertoAppWeb({ APP_WEB_PORT: "8401" }), 8401);
  assert.throws(() => puertoAppWeb({ APP_WEB_PORT: "0" }), /APP_WEB_PORT/);
});

test("solo /api va a la API; la app y la recarga en caliente van a Metro", () => {
  for (const ruta of ["/api/jugador", "/api/vivo", "/api", "/api?x=1"]) assert.equal(esDeLaApi(ruta), true, ruta);
  for (const ruta of ["/jugar/", "/jugar/mesa", "/apis", "/message", "/_expo/static/js/web/a.js"]) assert.equal(esDeLaApi(ruta), false, ruta);
});

test("hacia la API, Host y Origin son los de la API y el Referer no viaja", () => {
  const salida = encabezadosHaciaApi({
    host: "localhost:8083", origin: "http://localhost:8083", referer: "http://localhost:8083/jugar/",
    cookie: "truco_sesion=abc", "sec-websocket-protocol": "truco.v1",
  }, vps);
  assert.deepEqual(salida, { cookie: "truco_sesion=abc", "sec-websocket-protocol": "truco.v1", host: "eltru.co", origin: "https://eltru.co" });
  assert.equal("origin" in encabezadosHaciaApi({ host: "localhost:8083" }, vps), false);
});

test("las redirecciones de la API vuelven al proxy; las de Keycloak no", () => {
  assert.equal(locationHaciaProxy("https://eltru.co/#jugador", vps, proxy), "http://localhost:8083/#jugador");
  assert.equal(locationHaciaProxy("/perfil/?baja=cancelada", vps, proxy), "http://localhost:8083/perfil/?baja=cancelada");
  const keycloak = "https://eltru.co.evil/realms/x";
  assert.equal(locationHaciaProxy(keycloak, vps, proxy), keycloak);
  assert.equal(locationHaciaProxy("https://accounts.google.com/o", vps, proxy), "https://accounts.google.com/o");
});

test("la cookie de eltru.co pierde Secure y Domain para valer en http://localhost", () => {
  assert.equal(cookieHaciaProxy("truco_sesion=x; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=60; Secure"),
    "truco_sesion=x; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=60");
  assert.equal(cookieHaciaProxy("a=b; Domain=eltru.co; secure"), "a=b");
  assert.match(cookieSesion("h"), /^truco_sesion=h; Path=\/api\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  assert.equal(leerCookie("a=1; app_web_ingreso=xyz; b=2", "app_web_ingreso"), "xyz");
  assert.equal(leerCookie(undefined, "a"), undefined);
});

test("el ingreso usa un par PKCE válido y vuelve al proxy por bucle local", () => {
  const { verificador, desafio } = parPkce();
  assert.equal(esDesafio(desafio), true);
  assert.equal(verificadorCorresponde(verificador, desafio), true);
  assert.equal(desafio, createHash("sha256").update(verificador).digest("base64url"));
  const url = new URL(urlIngreso(vps, proxy, desafio));
  assert.equal(url.origin + url.pathname, "https://eltru.co/api/auth/login");
  assert.equal(url.searchParams.get("app"), desafio);
  assert.equal(url.searchParams.get("retorno"), "http://localhost:8083" + RETORNO_LOCAL);
  assert.equal(esRetornoLocal(url.searchParams.get("retorno")), true);
});

test("después de ingresar se vuelve a una ruta de la app, nunca a otro sitio", () => {
  assert.equal(destinoDespuesDelIngreso("/jugar/"), "/jugar/");
  assert.equal(destinoDespuesDelIngreso("/jugar/?invitacion=abc"), "/jugar/?invitacion=abc");
  for (const malo of [null, "", "/perfil/", "https://evil.com/jugar/", "//evil.com/jugar/", "/jugar//evil.com", "/jugar/\nx"]) {
    assert.equal(destinoDespuesDelIngreso(malo), "/jugar/", String(malo));
  }
});

test("en desarrollo /jugar/… se sirve desde la raíz", () => {
  assert.equal(rutaSinBase("/jugar"), "/");
  assert.equal(rutaSinBase("/jugar/"), "/");
  assert.equal(rutaSinBase("/jugar/sala/abc"), "/sala/abc");
  assert.equal(rutaSinBase("/jugar/canvaskit.wasm"), "/canvaskit.wasm");
  for (const ruta of ["/", "/sala/abc", "/jugarx", "/api/jugador"]) assert.equal(rutaSinBase(ruta), null, ruta);
});
