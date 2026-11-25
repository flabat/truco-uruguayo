import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import configuracion, { numeroDeBuild } from "../../app/app.config.ts";
import { iconos } from "../../scripts/app-iconos.mjs";

const appJson = JSON.parse(await readFile(new URL("../../app/app.json", import.meta.url), "utf8"));
const assets = new URL("../../app/", import.meta.url);

test("el número de build sale de la cantidad de commits o de TRUCO_BUILD", () => {
  assert.equal(numeroDeBuild({}, () => "364\n"), 364);
  assert.equal(numeroDeBuild({ TRUCO_BUILD: " 500 " }, () => "364"), 500);
  assert.throws(() => numeroDeBuild({ TRUCO_BUILD: "1.2" }, () => "364"), /entero positivo/);
  assert.throws(() => numeroDeBuild({ TRUCO_BUILD: "0" }, () => "364"), /entero positivo/);
  assert.equal(numeroDeBuild({}, () => { throw new Error("sin git"); }), 1);
});

test("app.config.ts agrega el mismo build a iOS y Android sin perder app.json", () => {
  const anterior = process.env.TRUCO_BUILD;
  process.env.TRUCO_BUILD = "42";
  try {
    const config = configuracion({ config: appJson.expo, projectRoot: ".", staticConfigPath: null, packageJsonPath: null });
    assert.equal(config.version, appJson.expo.version);
    assert.equal(config.ios?.buildNumber, "42");
    assert.equal(config.ios?.bundleIdentifier, "co.eltru.app");
    assert.equal(config.android?.versionCode, 42);
    assert.equal(config.android?.package, "co.eltru.app");
  } finally {
    if (anterior === undefined) delete process.env.TRUCO_BUILD;
    else process.env.TRUCO_BUILD = anterior;
  }
});

test("la app no pide micrófono, ubicación, almacenamiento ni Face ID", () => {
  const { android, plugins } = appJson.expo;
  for (const permiso of ["RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW"]) {
    assert.ok(android.blockedPermissions.includes(`android.permission.${permiso}`), permiso);
  }
  assert.equal(android.permissions, undefined);
  const opciones = (nombre: string) => plugins.find((p: unknown) => Array.isArray(p) && p[0] === nombre)?.[1];
  assert.deepEqual(opciones("expo-audio"), { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false });
  assert.deepEqual(opciones("expo-secure-store"), { faceIDPermission: false });
});

test("los íconos versionados tienen el tamaño y la transparencia que piden las tiendas", async () => {
  const { expo } = appJson;
  const esperados = new Map([
    [expo.ios.icon, { lado: 1024, alfa: false }],
    [expo.android.adaptiveIcon.backgroundImage, { lado: 1024, alfa: false }],
    [expo.android.adaptiveIcon.foregroundImage, { lado: 1024, alfa: true }],
    [expo.android.adaptiveIcon.monochromeImage, { lado: 1024, alfa: true }],
    [expo.web.favicon, { lado: 196, alfa: true }],
  ]);
  for (const [ruta, { lado, alfa }] of esperados) {
    const datos = await sharp(new URL(ruta, assets).pathname).metadata();
    assert.equal(datos.width, lado, ruta);
    assert.equal(datos.height, lado, ruta);
    assert.equal(datos.hasAlpha, alfa, ruta);
  }
  const archivos = iconos("").map((icono) => `./assets/icono/${icono.archivo}`);
  for (const ruta of [...esperados.keys(), expo.icon]) assert.ok(archivos.includes(ruta), `${ruta} sale de scripts/app-iconos.mjs`);
});
