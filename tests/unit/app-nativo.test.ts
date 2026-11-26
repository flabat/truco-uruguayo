import assert from "node:assert/strict";
import test from "node:test";
import { direccionDeLaApi } from "../../app/src/direccion-api.ts";
import {
  carpetaBuild, elegirDispositivoFisico, elegirSimulador, enlaceDevClient, esMetro, leerArgumentos, leerEnv, puertoMetro, urlApi,
} from "../../scripts/app-nativo-opciones.ts";

test("app:nativo lee la plataforma, el perfil de API y las opciones", () => {
  assert.deepEqual(leerArgumentos(["ios"]), { plataforma: "ios", api: "vps", dispositivo: undefined, fisico: false, recompilar: false });
  assert.deepEqual(leerArgumentos(["android", "--api", "local", "--dispositivo", "Pixel_API_36", "--recompilar"]),
    { plataforma: "android", api: "local", dispositivo: "Pixel_API_36", fisico: false, recompilar: true });
  assert.equal(leerArgumentos(["ios", "--fisico"]).fisico, true);
  assert.equal(leerArgumentos(["--api=local", "ios"]).api, "local");
});

test("app:nativo rechaza argumentos incompletos o desconocidos", () => {
  assert.throws(() => leerArgumentos([]), /Falta la plataforma/);
  assert.throws(() => leerArgumentos(["ios", "android"]), /una sola plataforma/);
  assert.throws(() => leerArgumentos(["ios", "--api", "prod"]), /Perfil de API desconocido/);
  assert.throws(() => leerArgumentos(["ios", "--api"]), /Falta el valor de --api/);
  assert.throws(() => leerArgumentos(["web"]), /Argumento desconocido: web/);
  assert.throws(() => leerArgumentos(["android", "--fisico"]), /--fisico es solo para iOS/);
});

test("Metro usa METRO_PORT de .env.trabajo o el 8082, nunca el 8081 por defecto", () => {
  const env = leerEnv("# ranura 3\nexport METRO_PORT=\"8113\"\nWEB_PORT=8111\n\nCOMPOSE_PROJECT_NAME='truco-issue-9'\n");
  assert.deepEqual(env, { METRO_PORT: "8113", WEB_PORT: "8111", COMPOSE_PROJECT_NAME: "truco-issue-9" });
  assert.equal(puertoMetro(env), 8113);
  assert.equal(puertoMetro({}), 8082);
  assert.equal(puertoMetro({ METRO_PORT: "" }), 8082);
  assert.throws(() => puertoMetro({ METRO_PORT: "80a" }), /METRO_PORT no es un puerto válido/);
  assert.throws(() => puertoMetro({ METRO_PORT: "70000" }), /no es un puerto válido/);
});

test("los perfiles de API apuntan al VPS o a la web local de este worktree", () => {
  assert.equal(urlApi("vps", { WEB_PORT: "8111" }), "https://eltru.co");
  assert.equal(urlApi("local", {}), "http://localhost:8081");
  assert.equal(urlApi("local", { WEB_PORT: "8111" }), "http://localhost:8111");
  assert.equal(urlApi("local", { WEB_PORT: "8111" }, "192.168.0.47"), "http://192.168.0.47:8111");
  assert.equal(urlApi("vps", {}, "192.168.0.47"), "https://eltru.co");
});

test("en Android la app traduce localhost a 10.0.2.2 y deja el resto igual", () => {
  assert.equal(direccionDeLaApi("http://localhost:8081", "android"), "http://10.0.2.2:8081");
  assert.equal(direccionDeLaApi("http://127.0.0.1:8111/", "android"), "http://10.0.2.2:8111/");
  assert.equal(direccionDeLaApi("http://localhost", "android"), "http://10.0.2.2");
  assert.equal(direccionDeLaApi("http://localhost:8081", "ios"), "http://localhost:8081");
  assert.equal(direccionDeLaApi("https://eltru.co", "android"), "https://eltru.co");
  assert.equal(direccionDeLaApi("http://localhost.example.com", "android"), "http://localhost.example.com");
});

test("la caché y el enlace del cliente de desarrollo", () => {
  assert.equal(carpetaBuild("/c/truco", "ios", "abc123"), "/c/truco/builds/ios-abc123");
  assert.equal(carpetaBuild("/c/truco", "ios", "abc123", true), "/c/truco/builds/ios-fisico-abc123");
  assert.equal(enlaceDevClient("el-truco", "http://localhost:8082"),
    "exp+el-truco://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082");
  assert.equal(esMetro("packager-status:running\n"), true);
  assert.equal(esMetro("<html>"), false);
});

test("elegirSimulador respeta el pedido y si no prefiere un iPhone encendido", () => {
  const lista = { devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-27-2": [
      { udid: "A", name: "iPad Air", state: "Booted" },
      { udid: "B", name: "iPhone 17", state: "Shutdown" },
      { udid: "C", name: "iPhone 18 Pro", state: "Booted" },
      { udid: "D", name: "iPhone Viejo", state: "Shutdown", isAvailable: false },
    ],
    "com.apple.CoreSimulator.SimRuntime.watchOS-12-0": [{ udid: "W", name: "Apple Watch", state: "Booted" }],
  } };
  assert.equal(elegirSimulador(lista)?.udid, "C");
  assert.equal(elegirSimulador(lista, "iPhone 17")?.udid, "B");
  assert.equal(elegirSimulador(lista, "A")?.udid, "A");
  assert.equal(elegirSimulador(lista, "iPhone Viejo"), undefined);
  assert.equal(elegirSimulador(lista, "Apple Watch"), undefined);
  const apagados = { devices: { "iOS-27-2": [{ udid: "B", name: "iPhone 17", state: "Shutdown" }] } };
  assert.equal(elegirSimulador(apagados)?.udid, "B");
});

test("elegirDispositivoFisico descarta los simuladores que Xcode 27 lista en devicectl", () => {
  const disp = (udid: string, name: string, reality: string, pairingState = "paired", platform = "iOS") => ({
    identifier: `id-${udid}`,
    connectionProperties: { pairingState, tunnelState: "disconnected" },
    deviceProperties: { name },
    hardwareProperties: { platform, reality, udid },
  });
  const lista = { result: { devices: [
    disp("SIM", "iPhone 18 Pro", "simulated"),
    disp("MAC", "MacBook Air", "physical", "paired", "macOS"),
    disp("NUEVO", "iPhone sin confiar", "physical", "unpaired"),
    disp("REAL", "iPhone de prueba", "physical"),
  ] } };
  assert.deepEqual(elegirDispositivoFisico(lista), { udid: "REAL", name: "iPhone de prueba" });
  assert.equal(elegirDispositivoFisico(lista, "id-REAL")?.udid, "REAL");
  assert.equal(elegirDispositivoFisico(lista, "iPhone de prueba")?.udid, "REAL");
  assert.equal(elegirDispositivoFisico(lista, "iPhone 18 Pro"), undefined);
  assert.equal(elegirDispositivoFisico(lista, "NUEVO"), undefined);
  assert.equal(elegirDispositivoFisico({ result: { devices: [disp("SIM", "iPhone 17", "simulated")] } }), undefined);
  assert.equal(elegirDispositivoFisico({}), undefined);
});
