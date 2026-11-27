// Con actores aprendidos activados al pie, las mesas nuevas al pie los usan en lugar de la política fija.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:3001/api";
const token = randomUUID();
const { rows: [jugador] } = await pool.query(
  "INSERT INTO juego.jugadores(emisor,sujeto,nombre) VALUES ('prueba-pie-aprendido',$1,'Prueba al pie') RETURNING id", [token]);
await pool.query("INSERT INTO juego.sesiones(clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(token).digest("hex"), jugador.id]);
const pines = Object.fromEntries((await pool.query(
  "SELECT formato, pin FROM juego.activaciones WHERE formato IN ('pairs-pie','triples-pie')")).rows.map(f => [f.formato, f.pin]));
const mesas = [];
try {
  for (const [modo, formato, clave] of [["2v2", "pairs-private-senas", "pairs-pie"], ["3v3", "triples", "triples-pie"]]) {
    assert.match(pines[clave] ?? "", /^[0-9a-f]{64}$/, "Falta activar " + clave);
    const r = await fetch(base + "/mesas", { method: "POST", headers: { cookie: "truco_sesion=" + token, origin: process.env.WEB_ORIGIN,
      "content-type": "application/json" }, body: JSON.stringify({ modo, meta: modo === "3v3" ? 50 : 40, formato, versionSenas: "senas-pie-v1", publica: false }) });
    const m = await r.json();
    assert.equal(r.status, 201, JSON.stringify(m));
    mesas.push(m.id);
    assert.equal(m.politica, pines[clave]);
    console.log(modo, "al pie con el actor aprendido", m.politica.slice(0, 12));
  }
} finally {
  await pool.query("DELETE FROM juego.asientos WHERE mesa=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.mesas WHERE id=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.sesiones WHERE jugador=$1", [jugador.id]);
  await pool.query("DELETE FROM juego.jugadores WHERE id=$1", [jugador.id]);
  await pool.end();
}
