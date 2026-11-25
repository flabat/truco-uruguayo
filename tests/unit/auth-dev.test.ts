import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { crearIngresoDePrueba, ingresoDePruebaHabilitado, jugadoresDePrueba } from "../../api/auth-dev.ts";
import { hash } from "../../api/sesion.ts";

const web = new URL("http://localhost:8081");
const desafio = "a".repeat(43);

/** Una base falsa que registra cada consulta y responde lo mínimo que necesita el ingreso. */
function baseFalsa({ bajaVencida = false } = {}) {
  const consultas: { sql: string; valores: unknown[] }[] = [];
  const query = async (sql: string, valores: unknown[] = []) => {
    consultas.push({ sql, valores });
    if (sql.includes("INSERT INTO juego.jugadores")) return { rows: [{ id: "jugador-" + valores[1] }], rowCount: 1 };
    if (sql.includes("SELECT vence > now() AS vigente")) return { rows: bajaVencida ? [{ vigente: false }] : [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  };
  return { consultas, pool: { query } as never };
}

async function servir(pool: never, prueba: (base: string) => Promise<void>) {
  const atender = crearIngresoDePrueba(pool, {
    emisor: "http://localhost:8080/realms/mesa-local", web,
    cookie: handle => "truco_sesion=" + handle + "; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=604800",
  });
  const servidor = createServer((req, res) => void atender(req, res, hash("anterior")));
  await new Promise<void>(listo => servidor.listen(0, "127.0.0.1", listo));
  try {
    await prueba("http://127.0.0.1:" + (servidor.address() as AddressInfo).port + "/api/auth/dev");
  } finally {
    servidor.close();
  }
}

const enviar = (url: string, datos: unknown, headers: Record<string, string> = {}) => fetch(url, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(datos),
});

test("AUTH_DEV se habilita solo con el valor 1", () => {
  assert.equal(ingresoDePruebaHabilitado({ AUTH_DEV: "1" }), true);
  for (const valor of [undefined, "", "0", "true", "si"]) assert.equal(ingresoDePruebaHabilitado({ AUTH_DEV: valor }), false);
});

test("los jugadores de prueba son los del realm local, con su sujeto y nombre", () => {
  const realm = JSON.parse(readFileSync(new URL("../../infra/mesa-local-realm.json", import.meta.url), "utf8"));
  assert.deepEqual(
    jugadoresDePrueba.map(({ usuario, nombre, sujeto }) => ({ usuario, nombre, sujeto })),
    realm.users.map((u: { username: string; firstName: string; id: string }) => ({ usuario: u.username, nombre: u.firstName, sujeto: u.id })),
  );
});

test("GET anuncia los seis jugadores sin datos de identidad", async () => {
  const { pool } = baseFalsa();
  await servir(pool, async url => {
    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { usuarios: jugadoresDePrueba.map(({ usuario, nombre }) => ({ usuario, nombre })) });
  });
});

test("en la web deja la cookie de sesión y reemplaza la anterior del navegador", async () => {
  const { pool, consultas } = baseFalsa();
  await servir(pool, async url => {
    const r = await enviar(url, { usuario: "ana" }, { origin: web.origin });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { jugador: { id: "jugador-2e98a700-1205-4e9b-8161-000000000001", nombre: "Ana" }, bajaCancelada: false });
    const cookie = r.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^truco_sesion=[A-Za-z0-9_-]{43}; Path=\/api\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
    const handle = cookie.slice("truco_sesion=".length, cookie.indexOf(";"));
    const alta = consultas.find(c => c.sql.includes("INSERT INTO juego.jugadores"))!;
    assert.deepEqual(alta.valores, ["http://localhost:8080/realms/mesa-local", "2e98a700-1205-4e9b-8161-000000000001", "Ana"]);
    const sesion = consultas.find(c => c.sql.includes("INSERT INTO juego.sesiones"))!;
    assert.deepEqual(sesion.valores, [hash("anterior"), hash(handle), "jugador-2e98a700-1205-4e9b-8161-000000000001"]);
  });
});

test("en la app entrega un código de canje atado al desafío, sin cookie", async () => {
  const { pool, consultas } = baseFalsa();
  await servir(pool, async url => {
    const r = await enviar(url, { usuario: "luis", app: desafio });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("set-cookie"), null);
    const { codigo } = await r.json();
    assert.match(codigo, /^[A-Za-z0-9_-]{43}$/);
    const canje = consultas.find(c => c.sql.includes("INSERT INTO juego.canjes"))!;
    assert.deepEqual(canje.valores, [hash(codigo), "jugador-2e98a700-1205-4e9b-8161-000000000006", desafio, false]);
    assert.ok(!consultas.some(c => c.sql.includes("juego.sesiones")), "la sesión la crea el canje");
  });
});

test("rechaza usuarios desconocidos, desafíos inválidos y la cookie sin origen del juego", async () => {
  const { pool, consultas } = baseFalsa();
  await servir(pool, async url => {
    assert.equal((await enviar(url, { usuario: "mallory" }, { origin: web.origin })).status, 400);
    assert.equal((await enviar(url, { usuario: "ana", app: "corto" })).status, 400);
    assert.equal((await enviar(url, { usuario: "ana", app: 7 })).status, 400);
    assert.equal((await enviar(url, { usuario: "ana" })).status, 403);
    assert.equal((await enviar(url, { usuario: "ana" }, { origin: "https://ajeno.example" })).status, 403);
    assert.equal((await fetch(url, { method: "DELETE" })).status, 405);
    assert.equal(consultas.length, 0);
  });
});

test("una cuenta con la baja vencida no entra", async () => {
  const { pool, consultas } = baseFalsa({ bajaVencida: true });
  await servir(pool, async url => {
    const r = await enviar(url, { usuario: "eva", app: desafio });
    assert.equal(r.status, 403);
    assert.ok(!consultas.some(c => c.sql.includes("juego.canjes")));
  });
});
