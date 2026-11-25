import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { rutaDelSistema } from "../../app/src/ingreso/retorno.ts";
import { asociacionApple, avisos, componentesApple, generar, rutasAndroid, validarHuellas, vinculosAndroid } from "../../scripts/enlaces-app.mjs";

const app = JSON.parse(readFileSync(new URL("../../app/app.json", import.meta.url), "utf8")).expo;
const id = "0b6f3c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b";
const huella = "AB:".repeat(31) + "CD";

/** Enlaces del sitio que abren la app y la pantalla a la que llegan. */
const abren: [string, string][] = [
  ["https://eltru.co/jugar/?invitacion=abc_DEF-123", "/invitacion/abc_DEF-123"],
  ["https://eltru.co/jugar?invitacion=abc", "/invitacion/abc"],
  ["https://eltru.co/jugar/?mesa=" + id, "/sala/" + id],
  ["https://eltru.co/jugar/?mirar=" + id, "/mirar/" + id],
  ["https://eltru.co/volver/?mesa=" + id, "/sala/" + id],
  ["https://eltru.co/volver?mesa=" + id, "/sala/" + id],
  ["https://eltru.co/app/?invitacion=abc", "/invitacion/abc"],
  ["https://eltru.co/app?mirar=" + id, "/mirar/" + id],
  ["https://eltru.co/app/invitacion/abc", "/invitacion/abc"],
  ["https://eltru.co/app/sala/" + id, "/sala/" + id],
  ["https://eltru.co/app/mirar/" + id, "/mirar/" + id],
  // La exportación web de la app, cuando se mude de /app/ a /jugar/.
  ["https://eltru.co/jugar/invitacion/abc", "/invitacion/abc"],
  ["https://eltru.co/jugar/sala/" + id + "/", "/sala/" + id],
  ["https://eltru.co/jugar/mirar/" + id, "/mirar/" + id],
  // Un enlace de espectador nunca se toma como invitación.
  ["https://eltru.co/jugar/?mirar=" + id + "&invitacion=abc", "/mirar/" + id],
];

/** Enlaces del dominio que siguen en la web: ni iOS ni Android se los dan a la app. */
const quedanEnLaWeb = [
  "https://eltru.co/",
  "https://eltru.co/aprender/",
  "https://eltru.co/aprender/envido/?invitacion=abc",
  "https://eltru.co/reglas/",
  "https://eltru.co/reglas/truco/",
  "https://eltru.co/api/invitaciones/abc",
  "https://eltru.co/api/auth/login?volver=/jugar/?invitacion=abc",
  "https://eltru.co/realms/mesa/protocol/openid-connect/auth",
  "https://eltru.co/resources/x.css",
  "https://eltru.co/perfil/",
  "https://eltru.co/privacidad/",
  "https://eltru.co/jugadores/",
  "https://eltru.co/volveremos/?mesa=" + id,
];

/** Coincidencia de un patrón de apple-app-site-association: `*` es cualquier texto, `?` un carácter. */
function patron(texto: string, glob: string) {
  const regex = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp("^" + regex + "$").test(texto);
}

function abreEnIos(enlace: string) {
  const url = new URL(enlace);
  for (const c of componentesApple() as { "/": string; "?"?: Record<string, string>; exclude?: boolean }[]) {
    if (!patron(url.pathname, c["/"])) continue;
    if (c["?"] && !Object.entries(c["?"]).every(([k, v]) => url.searchParams.has(k) && patron(url.searchParams.get(k)!, v))) continue;
    return !c.exclude;
  }
  return false;
}

function abreEnAndroid(enlace: string) {
  const url = new URL(enlace);
  return app.android.intentFilters.some((filtro: { data: { scheme: string; host: string; path?: string; pathPrefix?: string }[] }) =>
    filtro.data.some(d => d.scheme === url.protocol.slice(0, -1) && d.host === url.hostname
      && (d.path === url.pathname || (d.pathPrefix !== undefined && url.pathname.startsWith(d.pathPrefix)))));
}

test("los enlaces de invitación, volver y mirar abren su pantalla en iOS y Android", () => {
  for (const [enlace, pantalla] of abren) {
    assert.equal(rutaDelSistema(enlace), pantalla, enlace);
    assert.ok(abreEnIos(enlace), "iOS: " + enlace);
    assert.ok(abreEnAndroid(enlace), "Android: " + enlace);
  }
});

test("el contenido del sitio, la API y la identidad no abren la app", () => {
  for (const enlace of quedanEnLaWeb) {
    assert.equal(abreEnIos(enlace), false, "iOS: " + enlace);
    assert.equal(abreEnAndroid(enlace), false, "Android: " + enlace);
  }
  // Los recursos de la exportación web tampoco, aunque estén bajo /app/.
  assert.equal(abreEnIos("https://eltru.co/app/_expo/static/js/web/entry.js"), false);
});

test("iOS solo abre /jugar/ y /volver/ con un parámetro de mesa; Android abre el salón", () => {
  for (const enlace of ["https://eltru.co/jugar/", "https://eltru.co/app/", "https://eltru.co/volver/", "https://eltru.co/jugar/?invitacion="]) {
    assert.equal(abreEnIos(enlace), false, enlace);
    // Los filtros de Android no distinguen la consulta: si llega, la app muestra el inicio.
    assert.ok(abreEnAndroid(enlace), enlace);
    assert.equal(rutaDelSistema(enlace), "/", enlace);
  }
});

test("un enlace del dominio con datos inválidos abre el inicio, no una pantalla rota", () => {
  for (const enlace of [
    "https://eltru.co/jugar/?mesa=1",
    "https://eltru.co/jugar/?mirar=abc",
    "https://eltru.co/jugar/?invitacion=" + "a".repeat(81),
    "https://eltru.co/volver/?mesa=../perfil",
    "https://eltru.co/app/sala/123",
    "https://eltru.co/app/invitacion/%E0%A4%A",
    "https://eltru.co/aprender/",
  ]) assert.equal(rutaDelSistema(enlace), "/", enlace);
});

test("los enlaces del esquema y de otros dominios siguen como antes", () => {
  for (const enlace of ["eltruco://invitacion/abc", "eltruco:///sala/" + id, "/mirar/" + id, "https://otro.example/jugar/?invitacion=abc"]) {
    assert.equal(rutaDelSistema(enlace), enlace, enlace);
  }
});

test("app.json asocia eltru.co con autoVerify y las mismas rutas que assetlinks", () => {
  assert.deepEqual(app.ios.associatedDomains, ["applinks:eltru.co"]);
  assert.equal(app.ios.bundleIdentifier, "co.eltru.app");
  assert.equal(app.android.package, "co.eltru.app");
  const [filtro] = app.android.intentFilters;
  assert.equal(filtro.autoVerify, true);
  assert.deepEqual(new Set(filtro.category), new Set(["BROWSABLE", "DEFAULT"]));
  const rutas = new Set(filtro.data.map((d: { path?: string; pathPrefix?: string }) => d.path ?? d.pathPrefix!.replace(/\/$/, "")));
  assert.deepEqual(rutas, new Set(rutasAndroid));
});

test("sin Team ID ni huella no se escribe nada y se avisa", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "well-known-"));
  try {
    const lista = generar(carpeta, {});
    assert.equal(lista.length, 2);
    assert.match(lista[0], /APPLE_TEAM_ID/);
    assert.match(lista[1], /ANDROID_CERT_SHA256/);
    assert.equal(existsSync(join(carpeta, "apple-app-site-association")), false);
    assert.equal(existsSync(join(carpeta, "assetlinks.json")), false);
    assert.deepEqual(avisos({ APPLE_TEAM_ID: " ", ANDROID_CERT_SHA256: "" }).length, 2);
  } finally {
    rmSync(carpeta, { recursive: true });
  }
});

test("con Team ID y huella se escriben los dos archivos", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "well-known-"));
  try {
    assert.deepEqual(generar(carpeta, { APPLE_TEAM_ID: "ABCDE12345", ANDROID_CERT_SHA256: huella }), []);
    const apple = JSON.parse(readFileSync(join(carpeta, "apple-app-site-association"), "utf8"));
    assert.deepEqual(apple.applinks.details[0].appIDs, ["ABCDE12345.co.eltru.app"]);
    assert.equal(apple.webcredentials, undefined);
    const android = JSON.parse(readFileSync(join(carpeta, "assetlinks.json"), "utf8"));
    assert.deepEqual(android, [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "co.eltru.app", sha256_cert_fingerprints: [huella] },
    }]);
  } finally {
    rmSync(carpeta, { recursive: true });
  }
});

test("las huellas se normalizan y los datos inválidos se rechazan", () => {
  const otra = "01".repeat(32);
  assert.deepEqual(validarHuellas(huella.toLowerCase() + ", " + otra + " " + huella), [huella, "01:".repeat(31) + "01"]);
  assert.equal(vinculosAndroid(""), null);
  assert.equal(asociacionApple(undefined), null);
  assert.throws(() => asociacionApple("abcde12345"), /APPLE_TEAM_ID/);
  assert.throws(() => asociacionApple("ABCDE1234"), /APPLE_TEAM_ID/);
  assert.throws(() => vinculosAndroid("AB:CD"), /ANDROID_CERT_SHA256/);
});
