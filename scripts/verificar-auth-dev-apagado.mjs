// Desde el contenedor de la API: sin AUTH_DEV la ruta de prueba no existe; con AUTH_DEV, sí.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import pg from "pg";

const { crearAuth } = await import("/app/api/auth.ts");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const local = new URL("http://localhost:8081");
const opciones = {
  web: local, callback: new URL("/api/auth/callback", local), local: true,
  issuer: new URL("http://localhost:8080/realms/mesa-local"), backend: new URL("http://identidad:8080/realms/mesa-local"),
};

async function probar(ingresoDePrueba) {
  const auth = crearAuth(pool, { ...opciones, ingresoDePrueba });
  const servidor = createServer((req, res) => void auth(req, res));
  await new Promise(listo => servidor.listen(0, "127.0.0.1", listo));
  const url = `http://127.0.0.1:${servidor.address().port}/api/auth/dev`;
  try {
    const anuncio = await fetch(url);
    const alta = await fetch(url, { method: "POST", headers: { "content-type": "application/json", origin: local.origin },
      body: JSON.stringify({ usuario: "ana" }) });
    return { anuncio: anuncio.status, alta: alta.status, cookie: alta.headers.get("set-cookie") };
  } finally {
    servidor.close();
  }
}

try {
  const antes = (await pool.query("SELECT count(*)::int AS n FROM juego.sesiones")).rows[0].n;
  assert.deepEqual(await probar(false), { anuncio: 404, alta: 404, cookie: null });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM juego.sesiones")).rows[0].n, antes, "sin AUTH_DEV no se crea nada");
  const encendido = await probar(true);
  assert.equal(encendido.anuncio, 200);
  assert.equal(encendido.alta, 200);
  assert.match(encendido.cookie ?? "", /^truco_sesion=/);
  console.log("Ingreso de prueba verificado · 404 sin AUTH_DEV y disponible con AUTH_DEV=1.");
} finally {
  await pool.end();
}
