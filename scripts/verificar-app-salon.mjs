// Desde el host, contra la web del stack descartable: en la exportación web de la app (/app/), eva crea una
// mesa de parejas (siempre con señas automáticas al pie), diego entra por la invitación sin sesión, clara
// la mira desde el salón y las computadoras completan la mesa. También: volver a la mesa, los enlaces
// ?mesa= y ?mirar=, la precarga de las cartas y un duelo con computadoras en escritorio. Además, lo que la
// app suma para no perder nada de /jugar/ (#403): ?crear=1, los conteos de /eventos/, el aviso de la
// comunidad, el enlace a «Mis partidas» y el aviso sin red.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mazo } from "@eltruco/motor/cartas.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const browser = await chromium.launch();
const espera = { timeout: 25_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });
const movil = { width: 375, height: 760 };
const uuid = "[a-f0-9-]{36}";

async function pagina(viewport = movil) {
  const context = await browser.newContext({ baseURL: web, viewport });
  const p = await context.newPage();
  p.setDefaultTimeout(25_000);
  return p;
}

/** Ingresa desde la pantalla de ingreso de la app, con el título que corresponda al enlace. */
async function ingresar(p, usuario, encabezado = "Entrá a jugar") {
  await expect(titulo(p, encabezado)).toBeVisible(espera);
  await boton(p, "Ingresar").click();
  await ingresarDesdeIdentidad(p, usuario);
}

async function api(p, ruta) {
  const r = await p.request.get(ruta);
  assert.equal(r.status(), 200, ruta + " · " + r.status());
  return r.json();
}

const idDeLaRuta = (p, prefijo) => new URL(p.url()).pathname.replace(prefijo, "");

async function crearMesa(p, { modalidad, meta, computadoras = false }) {
  await boton(p, "Crear mesa").click();
  await expect(titulo(p, "Crear una mesa")).toBeVisible();
  // Nunca se ofrece la seña elegida a mano: la única casilla es la del salón.
  await expect(p.getByRole("checkbox")).toHaveCount(1);
  await expect(p.getByRole("checkbox", { name: "Mostrar en el salón" })).toHaveAttribute("aria-checked", "true");
  const { modos } = await api(p, "/api/modalidades");
  await expect(p.getByRole("radio")).toHaveCount(modos.includes("3v3") ? 3 : 2);
  await p.getByRole("radio", { name: new RegExp("^" + modalidad) }).click();
  await expect(p.getByRole("radio", { name: new RegExp("^" + modalidad) })).toHaveAttribute("aria-checked", "true");
  const campo = p.getByRole("textbox", { name: "Tantos para ganar el chico" });
  await campo.fill("31");
  await expect(p.getByText("Elegí un número par desde 2.")).toBeVisible();
  await expect(boton(p, "Crear mesa")).toHaveAttribute("aria-disabled", "true");
  await campo.fill(String(meta));
  await expect(p.getByText(`${meta / 2} malas y ${meta / 2} buenas`)).toBeVisible();
  await boton(p, computadoras ? "Jugar con computadoras" : "Crear mesa").click();
}

async function probarParejas() {
  const eva = await pagina();
  const cartas = new Map();
  eva.on("response", r => {
    const nombre = /\/app\/assets\/_public\/img\/cartas\/tatu\/([a-z0-9-]+)\.[a-f0-9]+\.webp$/.exec(new URL(r.url()).pathname)?.[1];
    if (nombre) cartas.set(nombre, r.status());
  });
  await eva.goto("/app/");
  await ingresar(eva, "eva");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  // Las cartas se precargan en el salón, antes de la mesa.
  await expect.poll(() => cartas.size, espera).toBe(41);
  assert.deepEqual([...cartas.keys()].sort(), [...mazo, "reverso"].sort());
  assert.ok([...cartas.values()].every(estado => estado === 200), "todas las cartas responden 200");

  await crearMesa(eva, { modalidad: "2 contra 2", meta: 30 });
  await eva.waitForURL(new RegExp(`/app/sala/${uuid}\\?nueva=1$`));
  await expect(titulo(eva, "Esperando jugadores")).toBeVisible();
  const id = idDeLaRuta(eva, "/app/sala/");
  const mesa = await api(eva, "/api/mesas/" + id);
  assert.equal(mesa.modo, "2v2");
  assert.equal(mesa.formato, "pairs-private-senas");
  assert.equal(mesa.versionSenas, versionSenasPie);
  assert.equal(mesa.meta, 30);
  assert.equal(mesa.publica, true);
  await expect(eva.getByText("Faltan 3 jugadores para repartir.")).toBeVisible();
  await expect(eva.getByText(/^Señas automáticas al pie/)).toBeVisible();
  const enlace = await eva.getByRole("textbox", { name: "Enlace de invitación" }).inputValue();
  assert.match(enlace, new RegExp(`^${web}/app/\\?invitacion=[A-Za-z0-9_-]+$`));
  assert.equal(new URL(enlace).searchParams.get("invitacion"), new URL(mesa.invitacion).searchParams.get("invitacion"));

  // diego abre la invitación sin sesión: ingresa y vuelve a la invitación.
  const diego = await pagina();
  await diego.goto(enlace);
  await ingresar(diego, "diego", "Te invitaron a una mesa");
  await diego.waitForURL(/\/app\/invitacion\//, espera);
  await boton(diego, "Ocupar mi asiento").click();
  await diego.waitForURL(new RegExp(`/app/sala/${id}$`));
  await expect(titulo(diego, "Esperando jugadores")).toBeVisible();
  await expect(eva.getByText("Faltan 2 jugadores para repartir.")).toBeVisible(espera);
  // La misma invitación, ya sentado, lleva a la sala.
  await diego.goto(enlace);
  await diego.waitForURL(new RegExp(`/app/sala/${id}$`), espera);

  // Las computadoras completan la mesa y todos pasan a la mesa en juego.
  for (const asiento of [3, 4]) {
    await boton(eva, `Agregar computadora al asiento ${asiento}`).click();
    if (asiento === 3) await expect(eva.getByText("Falta un jugador para repartir.")).toBeVisible(espera);
  }
  await Promise.all([eva, diego].map(p => p.waitForURL(`/app/mesa?id=${id}`, espera)));
  // La mesa carga CanvasKit: con la máquina cargada tarda más que el plazo por defecto.
  await Promise.all([eva, diego].map(p => expect(p.getByTestId("mesa")).toBeVisible(espera)));

  // clara la ve en el salón y la mira.
  const clara = await pagina();
  await clara.goto("/app/");
  await ingresar(clara, "clara");
  await expect(titulo(clara, "Mesas en juego")).toBeVisible(espera);
  const fila = clara.getByTestId("mesa-" + id);
  await expect(fila).toBeVisible(espera);
  await expect(fila).toContainText("Parejas");
  await expect(fila).toContainText("2 personas y 2 computadoras");
  await boton(fila, "Mirar").click();
  await clara.waitForURL(`/app/mirar/${id}`);
  // La mesa nueva, sin mano ni Cantos: el tanteador nombra a cada pareja.
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.getByRole("heading", { level: 2, name: "La mano en juego" })).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando")).toBeVisible();
  await expect(boton(clara, "Volver al salón")).toBeVisible();
  await expect(boton(clara, "Cantos")).toHaveCount(0);
  // Las computadoras pueden haber cobrado algo (una flor) mientras clara entraba. Entre las piezas del
  // tanteador van espacios duros (\u00a0): `\s` los acepta.
  await expect(clara.getByLabel("Tanteador")).toHaveText(/^Jugador\s1\sy\sComputadora\s3\s\d+\s·\s\d+\sJugador\s2\sy\sComputadora\s4\s·\sa\s\d+$/);
  // El enlace ?mirar= nunca ocupa un asiento, aunque lleve también una invitación.
  await clara.goto(`/app/?mirar=${id}&invitacion=${new URL(enlace).searchParams.get("invitacion")}`);
  await clara.waitForURL(`/app/mirar/${id}`, espera);
  assert.equal((await clara.request.get("/api/mesas/" + id)).status(), 404, "mirar no sienta a clara");

  // eva vuelve al salón y retoma su mesa; las rutas profundas resisten una recarga.
  // Con una hoja que pide respuesta (eva tiene flor o le tocaron envido), «Más» no abre: eva responde primero.
  await expect(async () => {
    for (const respuesta of ["Flor", "Quiero"]) {
      if (await boton(eva, respuesta).isVisible()) await boton(eva, respuesta).click();
    }
    await boton(eva, "Más").click({ timeout: 2_000 });
    await boton(eva, "Salir al salón").click({ timeout: 2_000 });
  }).toPass(espera);
  await expect(titulo(eva, "Mesas en juego")).toBeVisible();
  await boton(eva, "Volver a mi mesa").click();
  await eva.waitForURL(`/app/mesa?id=${id}`, espera);
  await eva.reload();
  await expect(eva.getByTestId("mesa")).toBeVisible(espera);
  await diego.goto(`/app/?mesa=${id}`);
  await diego.waitForURL(`/app/mesa?id=${id}`, espera);
  await diego.goto(`/app/sala/${id}`);
  await diego.waitForURL(`/app/mesa?id=${id}`, espera);
  await Promise.all([eva, diego, clara].map(p => p.context().close()));
}

async function probarDuelo() {
  const eva = await pagina({ width: 1280, height: 800 });
  await eva.goto("/app/");
  await ingresar(eva, "eva");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await crearMesa(eva, { modalidad: "1 contra 1", meta: 20, computadoras: true });
  await eva.waitForURL(new RegExp(`/app/mesa\\?id=${uuid}$`), espera);
  const id = new URL(eva.url()).searchParams.get("id");
  const mesa = await api(eva, "/api/mesas/" + id);
  assert.equal(mesa.modo, "1v1");
  assert.equal(mesa.meta, 20);
  assert.equal(mesa.versionSenas, undefined);
  assert.equal(mesa.lista, true);
  await eva.context().close();
}

async function probarParidadConJugar() {
  const eva = await pagina();
  const eventos = [];
  eva.on("request", r => {
    const evento = /^\/eventos\/([a-z-]+)\.txt$/.exec(new URL(r.url()).pathname)?.[1];
    if (evento) eventos.push(evento);
  });
  // /jugar/?crear=1 es un retorno permitido del ingreso: lleva a crear la mesa después de ingresar.
  await eva.goto("/app/?crear=1");
  await ingresar(eva, "eva", "Entrá con tu jugador");
  await expect(titulo(eva, "Crear una mesa")).toBeVisible(espera);
  await eva.goto("/app/");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  // El aviso de la comunidad, como en /jugar/: «Ahora no» lo oculta para este jugador.
  const comunidad = eva.getByRole("region", { name: "Comunidad de Discord" });
  await expect(comunidad).toBeVisible();
  await expect(boton(eva, "Unirme al Discord ↗")).toBeVisible();
  await comunidad.getByText("Ahora no", { exact: true }).click();
  await expect(comunidad).toHaveCount(0);
  await eva.reload();
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await expect(comunidad).toHaveCount(0);
  // «Mis partidas» sigue en el perfil del sitio.
  await eva.getByText("Tu perfil", { exact: true }).click();
  await expect(titulo(eva, "Tu perfil")).toBeVisible(espera);
  await eva.getByText("Ver mis partidas", { exact: true }).click();
  await eva.waitForURL(/\/perfil\/#mis-partidas$/, espera);
  await expect(eva.getByRole("heading", { name: "Mis partidas" })).toBeVisible(espera);
  await eva.goto("/app/");
  await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
  await crearMesa(eva, { modalidad: "1 contra 1", meta: 20 });
  await eva.waitForURL(new RegExp(`/app/sala/${uuid}\\?nueva=1$`), espera);
  await expect(titulo(eva, "Esperando jugadores")).toBeVisible(espera);
  await boton(eva, "Compartir invitación").click();
  await expect.poll(() => eventos).toContain("compartir-mesa");
  // Sin red, la sala lo dice enseguida y vuelve a leer la mesa cuando vuelve la red.
  await eva.context().setOffline(true);
  await expect(eva.getByText("Reconectando con tu mesa…")).toBeVisible();
  await eva.context().setOffline(false);
  await expect(eva.getByText("Reconectando con tu mesa…")).toHaveCount(0, espera);
  await eva.context().close();
}

try {
  await probarParejas();
  await probarDuelo();
  await probarParidadConJugar();
  console.log("App web verificada · salón, crear mesa con señas al pie, invitación, mirar, volver a la mesa, precarga de cartas, ?crear=1, conteos, comunidad y aviso sin red.");
} finally {
  await browser.close();
}
