// Ejecutar desde api con node --input-type=module en una base descartable.
// El modo real usa server.ts. El modo simulado monta las mismas rutas con Discord en memoria.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { crearRutasMesas } from "./mesas.ts";
import { crearSalon } from "./salon.ts";
import { avanzarManoComputadoras, crearPartidas, esRutaPartida } from "./partidas.ts";
import { insertarMesaComputadoras, servicioComputadoras } from "./ensayos.ts";
import { avanzarExhibicion } from "./exhibiciones.ts";
import { crearDiscord, configDiscord } from "./discord.ts";
import { crearVoz } from "./voz-discord.ts";

const real = process.argv[2] === "real";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const origen = new URL(process.env.WEB_ORIGIN);
const config = real ? configDiscord() :
  { servidor: "10000000000000004", categoria: "10000000000000005", token: "simulado" };
if (!config) throw Error("Falta la configuración del ensayo de Discord.");
const sim = real ? null : discordSimulado(config.servidor, config.categoria);
const transporte = sim?.transporte ?? fetch;
const discord = crearDiscord(config, transporte);
const voz = crearVoz(pool, discord, origen);
let rutas = crearRutasMesas(pool, origen, () => {}, voz, true);
let salon = crearSalon(pool, true, origen, voz);
const partidas = crearPartidas(pool, origen);
const server = real ? null : createServer((req,res) => {
  const atender = req.url.startsWith("/api/salon/") ? salon : esRutaPartida(req.url) ? partidas.atender : rutas;
  atender(req,res).catch(() => res.writeHead(503).end());
});
if (server) await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + (server?.address().port ?? process.env.PORT);
const mesas = [];
const emisor = "ensayo-voz-" + randomUUID();
let solicitudes = 0;

async function persona() {
  const secreto = randomBytes(32).toString("base64url");
  const { rows: [j] } = await pool.query(`INSERT INTO juego.jugadores(emisor,sujeto,nombre)
    VALUES ($1,$2,'Prueba automática') RETURNING id`, [emisor,randomUUID()]);
  await pool.query("INSERT INTO juego.sesiones(clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(secreto).digest("hex"), j.id]);
  return "truco_sesion=" + secreto;
}
async function post(ruta, cookie, datos = {}, origin = origen.origin) {
  const r = await fetch(base + ruta, { method: "POST", headers: { origin, ...(cookie && {cookie}), "content-type": "application/json" },
    body: JSON.stringify(datos), signal: AbortSignal.timeout(30000) });
  return { status: r.status, retry: r.headers.get("retry-after"), body: await r.json().catch(() => ({})) };
}
async function crear(cookie, modo, publica = false) {
  const r = await post("/api/mesas", cookie, { modo, publica });
  assert.equal(r.status, 201);
  mesas.push(r.body.id);
  return r.body;
}
async function consultar(ruta) {
  const r = await transporte("https://discord.com/api/v10" + ruta, { method: "GET", redirect: "error",
    headers: { Authorization: "Bot " + config.token }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error("Discord respondió HTTP " + r.status + " al verificar el ensayo.");
  return r.json();
}
async function abrir(mesa, cookie, espectador = false) {
  const prefijo = espectador ? "/api/salon/mesas/" : "/api/mesas/";
  const r = await post(prefijo + mesa.id + "/voz", cookie);
  assert.equal(r.status, 200, "La solicitud de voz debe tener éxito (HTTP " + r.status + ").");
  const url = new URL(r.body.enlace);
  assert.ok(url.origin === "https://discord.gg" && /^\/[\w-]+$/.test(url.pathname), "Destino de invitación inesperado.");
  const i = await consultar("/invites" + url.pathname);
  const id = i.channel?.id;
  assert.ok(id && await discord.comprobar(id) === id, "El canal debe ser de voz en la categoría configurada.");
  solicitudes++;
  return id;
}
const caducar = id => pool.query("UPDATE juego.voz_discord SET vence=now()-interval '1 minute', reintentar='-infinity' WHERE mesa=$1",[id]);
async function vinculo(id) { return (await pool.query("SELECT * FROM juego.voz_discord WHERE mesa=$1",[id])).rows[0]; }
const categoria = async () => (await consultar("/guilds/" + config.servidor + "/channels")).filter(c => c.parent_id === config.categoria);
async function probarEspectadores(a, b, espectador, privada) {
  const segundaCuenta = await persona();
  const humana = await crear(a, "1v1", true);
  const publica = "/api/salon/mesas/" + humana.id;
  const vozPublica = publica + "/voz";
  const juego = "/api/mesas/" + humana.id;
  const leer = async (ruta, cookie) => {
    const r = await fetch(base + ruta, { headers: { cookie } });
    assert.equal(r.status, 200, ruta);
    return r.json();
  };
  assert.equal((await post(vozPublica, espectador)).status, 404); // Todavía no se repartió.
  const token = new URL(humana.invitacion).searchParams.get("invitacion");
  assert.equal((await post("/api/invitaciones/" + token + "/unirse", b)).status, 200);
  await leer(juego + "/partida", a);
  const vista = await leer(publica, espectador);
  assert.equal(vista.vozDisponible, true);
  const lista = await leer("/api/salon/mesas", espectador);
  assert.ok(lista.mesas.some(m => m.id === humana.id));
  assert.ok(!JSON.stringify([lista, vista]).includes("discord.gg/"));
  assert.equal((await fetch(base + vozPublica, { headers: { cookie: espectador } })).status, 405);
  assert.equal((await post(vozPublica, null)).status, 401);
  assert.equal((await post(vozPublica, espectador, {}, "https://example.invalid")).status, 403);
  const secreta = await post("/api/salon/mesas/" + privada.id + "/voz", espectador);
  const desconocida = await post("/api/salon/mesas/" + randomUUID() + "/voz", espectador);
  assert.equal(secreta.status, 404);
  assert.deepEqual(secreta, desconocida);
  assert.ok(!await vinculo(humana.id));

  const [primero, segundo] = await Promise.all([
    abrir(humana, espectador, true), abrir(humana, segundaCuenta, true),
  ]);
  assert.equal(primero, segundo);
  assert.equal(await abrir(humana, a), primero);
  assert.equal(sim.mensajes.get(primero).length, 1);
  assert.equal((await post(juego + "/voz", espectador)).status, 404);
  sim.destinos.clear(); // Vencen las invitaciones ya emitidas en el proveedor simulado.
  assert.equal(await abrir(humana, espectador, true), primero);

  sim.fallos.invitar = true;
  assert.equal((await post(vozPublica, espectador)).status, 503);
  // Un corte del proveedor no afecta al árbitro. La voz tampoco modifica la versión pública.
  assert.equal((await leer(publica, espectador)).versionPublica, vista.versionPublica);
  const jugadores = [a, b];
  for (let paso = 0; paso < 6; paso++) {
    const manos = await Promise.all(jugadores.map(c => leer(juego + "/partida", c)));
    const i = manos.findIndex(m => m.vista.legales.length > 0);
    assert.notEqual(i, -1);
    const { vista: mano, version } = manos[i];
    const tipo = ["carta", "flor", "quiero", "paso-flor"].find(tipo => mano.legales.includes(tipo));
    assert.ok(tipo, "Falta una jugada aplicable a la mano del ensayo");
    const accion = tipo === "carta" ? { tipo, carta: mano.cartas[0] } : { tipo };
    assert.equal((await post(juego + "/acciones", jugadores[i], { id: randomUUID(), version, accion })).status, 200);
    if (tipo !== "paso-flor") break;
  }
  assert.notEqual((await leer(publica, espectador)).versionPublica, vista.versionPublica);
  sim.fallos.invitar = false;

  const clave = createHash("sha256").update(segundaCuenta.split("=")[1]).digest("hex");
  await pool.query("UPDATE juego.sesiones SET vence=now() WHERE clave=$1", [clave]);
  assert.equal((await post(vozPublica, segundaCuenta)).status, 401);
  salon = crearSalon(pool, false, origen, voz);
  assert.equal((await post(vozPublica, espectador)).status, 404);
  assert.equal(await abrir(humana, a), primero);
  salon = crearSalon(pool, true, origen);
  assert.equal((await leer(publica, espectador)).vozDisponible, false);
  assert.equal((await post(vozPublica, espectador)).status, 503);
  salon = crearSalon(pool, true, origen, voz);

  async function nuevaExhibicion() {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows: [fila] } = await db.query("SELECT creador FROM juego.mesas WHERE id=$1", [humana.id]);
      const id = await insertarMesaComputadoras(db, "duel", fila.creador, undefined, 6);
      const { rows: [expo] } = await db.query(`UPDATE juego.mesas SET meta=2 WHERE id=$1
        RETURNING id, modo, meta, version_senas, perfil_tercetos`, [id]);
      await avanzarManoComputadoras(db, expo);
      await db.query("COMMIT");
      mesas.push(id);
      return expo;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }
  const expo = await nuevaExhibicion();
  const rutaExpo = "/api/salon/mesas/" + expo.id;
  const detalleExpo = await leer(rutaExpo, espectador);
  assert.equal(detalleExpo.humanos, 0);
  assert.equal(detalleExpo.computadoras, 2);
  assert.equal(detalleExpo.vozDisponible, true);
  assert.notEqual(await abrir(expo, espectador, true), primero);
  await pool.query("UPDATE juego.mesas SET exhibicion_retirada=true WHERE id=$1", [expo.id]);
  assert.equal((await leer(rutaExpo, espectador)).vozDisponible, false);
  assert.equal((await post(rutaExpo + "/voz", espectador)).status, 404);

  await pool.query("UPDATE juego.mesas SET ultimo_hecho_publico=now()-interval '6 minutes' WHERE id=$1", [humana.id]);
  assert.equal((await post(vozPublica, espectador)).status, 404);

  const finalista = await nuevaExhibicion();
  const canal = await abrir(finalista, espectador, true);
  const servicio = servicioComputadoras(pool);
  try {
    // El reloj adelanta los intervalos entre turnos. El motor confirma las jugadas y el cierre.
    const turnosHumanos = `SELECT 1 FROM juego.turnos_bot t JOIN juego.mesas h ON t.mesa=h.id WHERE h.origen='humana'`;
    const espera = Date.now() + 60_000;
    for (let n = 0; n < 120; n++) {
      const paso = await avanzarExhibicion(pool, servicio, new Date(Date.now() + n * 9_000));
      if (paso === null) {
        // Las exhibiciones ceden el paso mientras la API juega turnos de computadora en mesas
        // con personas de las verificaciones anteriores: esperar a que terminen y reintentar.
        if ((await pool.query(turnosHumanos)).rowCount && Date.now() < espera) {
          await new Promise(listo => setTimeout(listo, 250));
          n--;
          continue;
        }
        break;
      }
      assert.equal(paso, finalista.id);
    }
  } finally { await servicio.close(); }
  const resultado = await leer("/api/salon/mesas/" + finalista.id, espectador);
  assert.equal(resultado.estado, "terminada");
  assert.equal(resultado.vozDisponible, true);
  assert.equal(await abrir(finalista, espectador, true), canal);
  const sobremesa = (await vinculo(finalista.id)).vence - Date.now();
  assert.ok(sobremesa > 29*60000 && sobremesa <= 30*60000 + 1000);
  await pool.query("UPDATE juego.mesas SET fin_publico=now()-interval '31 minutes' WHERE id=$1", [finalista.id]);
  assert.equal((await post("/api/salon/mesas/" + finalista.id + "/voz", espectador)).status, 404);
  await caducar(finalista.id);
  await voz.limpiarMesa(finalista.id);
  assert.ok(!await vinculo(finalista.id));
  assert.ok(!sim.canales.has(canal));
}

let preservados;
let fallo = false;
try {
  if (real) {
    for (let i = 0; i < 60; i++) {
      if (await fetch(base + "/health").then(r => r.ok).catch(() => false)) break;
      if (i === 59) throw Error("La API descartable no arrancó.");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  preservados = (await categoria()).filter(c => c.name === "Mesa 1").map(c => c.id);
  assert.ok(preservados.length, "No se pudo verificar la Mesa 1 manual en la categoría prevista.");
  const [a,b,c] = await Promise.all([persona(),persona(),persona()]);
  const una = await crear(a,"2v2");
  const otra = await crear(c,"1v1");
  const ruta = "/api/mesas/" + una.id + "/voz";
  assert.equal((await post(ruta,null)).status,401);
  assert.equal((await post(ruta,c)).status,404);
  assert.equal((await post(ruta,a,{},"https://example.invalid")).status,403);
  assert.ok(!await vinculo(una.id));
  const ingreso = new URL(una.invitacion).searchParams.get("invitacion");
  assert.equal((await post("/api/invitaciones/" + ingreso + "/unirse",b)).status,200);
  const [primero, segundo] = await Promise.all([abrir(una,a),abrir(una,b)]);
  assert.ok(primero === segundo && (await vinculo(una.id)).canal === primero);
  const vecino = await abrir(otra,c);
  assert.ok(primero !== vecino);
  if (sim) {
    await probarEspectadores(a, b, c, una);
    assert.equal(sim.mensajes.get(primero).length, 1);
    const boton = sim.mensajes.get(primero)[0].components[0].components[0];
    assert.deepEqual(boton, { type: 2, style: 5, label: "Volver a la mesa", url: new URL("/volver/?mesa=" + una.id, origen).href });
    sim.destinos.clear();
    assert.ok(await abrir(una,a) === primero);
    assert.equal(sim.mensajes.get(primero).length, 1);
    sim.canales.delete(primero);
    sim.fallos.perderMensaje = true;
    const reemplazo = await abrir(una,b);
    assert.notEqual(reemplazo, primero);
    assert.equal(sim.mensajes.get(reemplazo).length, 1);
    assert.equal((await vinculo(una.id)).regreso_publicado, false);
    sim.fallos.perderMensaje = false;
    await pool.query("UPDATE juego.voz_discord SET intento_regreso=now()-interval '1 hour' WHERE mesa=$1", [una.id]);
    assert.equal(await abrir(una,a), reemplazo);
    assert.equal((await vinculo(una.id)).regreso_publicado, true);
    assert.equal(sim.mensajes.get(reemplazo).length, 1);
    const tercera = await crear(a,"3v3");
    const pedir = () => post("/api/mesas/" + tercera.id + "/voz",a);
    sim.fallos.crear = 403;
    assert.equal((await pedir()).status,503);
    assert.ok(!await vinculo(tercera.id));
    sim.fallos.crear = 429;
    assert.equal((await pedir()).retry,"1");
    sim.fallos.crear = 0;
    assert.equal((await pedir()).status,503);
    await new Promise(r => setTimeout(r,1100));
    sim.fallos.perderAlta = true;
    assert.equal((await pedir()).status,503);
    const pendiente = await vinculo(tercera.id);
    assert.ok(pendiente.intento && !pendiente.canal);
    const creados = sim.canales.size;
    sim.fallos.perderAlta = false;
    sim.fallos.auditoria = true;
    assert.equal((await pedir()).status,503);
    assert.equal(sim.canales.size,creados);
    sim.fallos.auditoria = false;
    rutas = crearRutasMesas(pool, origen, () => {}, crearVoz(pool, crearDiscord(config, transporte), origen));
    const recuperado = await abrir(tercera,a);
    assert.equal(sim.canales.size,creados);
    assert.equal((await vinculo(tercera.id)).canal,recuperado);
    const control = sim.canales.get(sim.manual);
    control.name = sim.canales.get(recuperado).name;
    await caducar(tercera.id);
    sim.canales.get(recuperado).parent_id = "otra";
    await assert.rejects(voz.limpiarMesa(tercera.id));
    assert.ok(sim.canales.has(recuperado) && await vinculo(tercera.id));
    sim.canales.get(recuperado).parent_id = config.categoria;
    sim.fallos.borrar = true;
    await caducar(tercera.id);
    await assert.rejects(voz.limpiarMesa(tercera.id));
    assert.ok((await vinculo(tercera.id)).reintentar > new Date());
    sim.fallos.borrar = false;
    assert.ok((await vinculo(tercera.id)).retirando);
    const renovado = await abrir(tercera,a);
    assert.ok(renovado !== recuperado && !sim.canales.has(recuperado) && sim.canales.has(sim.manual));
    control.name = "Mesa 1";

    await caducar(tercera.id);
    const unir = new URL(tercera.invitacion).searchParams.get("invitacion");
    assert.equal((await post("/api/invitaciones/" + unir + "/unirse", b)).status, 200);
    assert.ok((await vinculo(tercera.id)).vence - Date.now() > 23 * 3600000);
    const lote = [];
    for (let i = 0; i < 9; i++) {
      const mesa = await crear(a, "1v1");
      await abrir(mesa, a);
      await caducar(mesa.id);
      lote.push(mesa.id);
    }
    await voz.limpiar();
    const quedan = await pool.query("SELECT mesa FROM juego.voz_discord WHERE mesa=ANY($1::uuid[])", [lote]);
    assert.equal(quedan.rowCount, 1);
    assert.ok(await vinculo(tercera.id));
    await pool.query(`INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,build,evento)
      VALUES ($1,1,1,1,'prueba',jsonb_build_object('tipo','cierre','fecha',now()))`, [una.id]);
    const sobremesa = (await vinculo(una.id)).vence - Date.now();
    assert.ok(sobremesa > 29*60000 && sobremesa <= 30*60000+1000);
    await voz.limpiarMesa(una.id);
    assert.ok(await vinculo(una.id));
    await pool.query(`UPDATE juego.eventos_chico SET evento=evento||jsonb_build_object('fecha',now()-interval '31 minutes')
      WHERE mesa=$1`, [una.id]);
    assert.equal((await post(ruta,a)).status,410);
  }
} catch (e) {
  fallo = true;
  // Nunca registrar una URL de invitación, el cuerpo del proveedor ni la credencial.
  console.error("Falló la verificación:", e instanceof assert.AssertionError ? e.message : String(e.message).replace(/https?:\/\/\S+/g,"[destino]"));
} finally {
  for (const id of mesas) {
    try {
      const antes = await vinculo(id);
      await caducar(id);
      await voz.limpiarMesa(id);
      assert.ok(!await vinculo(id), "Queda un vínculo del ensayo pendiente.");
      if (antes?.canal) assert.ok(await discord.comprobar(antes.canal) === null, "El canal de ensayo sigue presente.");
    } catch {
      fallo = true;
      console.error("Limpieza pendiente para la mesa de ensayo", id);
    }
  }
  try {
    if (preservados) {
      const despues = await categoria();
      assert.ok(preservados.every(id => despues.some(c => c.id === id && c.name === "Mesa 1")), "Revisar la Mesa 1 manual.");
    }
  } catch { fallo = true; console.error("Comprobación final de Mesa 1 pendiente."); }
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
}
if (fallo) process.exitCode = 1;
else console.log(`Discord ${real ? "real" : "simulado"}: ${solicitudes} solicitudes autorizadas verificadas, mismo canal por mesa, aislamiento, limpieza y Mesa 1 conservada.`);

function discordSimulado(servidor, categoria) {
  const bot = "10000000000000001";
  const manual = "10000000000000002";
  const canales = new Map([[manual, { id: manual, name: "Mesa 1", type: 2, guild_id: servidor, parent_id: categoria }]]);
  const auditoria = [];
  const destinos = new Map();
  const mensajes = new Map();
  let secuencia = BigInt(manual);
  const fallos = { crear: 0, invitar: false, perderAlta: false, perderMensaje: false, auditoria: false, borrar: false };
  function json(body, status = 200) { return Response.json(body, { status }); }
  const desconocido = () => json({ code: 10003 }, 404);
  async function transporte(url, opciones) {
    const ruta = new URL(url).pathname.replace("/api/v10", "");
    if (ruta === "/users/@me") return json({ id: bot });
    if (ruta.endsWith("/audit-logs")) return fallos.auditoria ? json({}, 403) : json({ audit_log_entries: auditoria });
    if (ruta === "/guilds/" + servidor + "/channels") {
      if (opciones.method === "GET") return json([...canales.values()]);
      if (fallos.crear) return json({ retry_after: 1 }, fallos.crear);
      const id = String(++secuencia);
      const canal = { ...JSON.parse(opciones.body), id, guild_id: servidor };
      canales.set(id, canal);
      auditoria.push({ action_type: 10, user_id: bot, reason: opciones.headers["X-Audit-Log-Reason"], target_id: id });
      if (fallos.perderAlta) throw new Error("Respuesta perdida");
      return json(canal, 201);
    }
    const [, recurso, id, operacion] = ruta.split("/");
    if (recurso === "invites") return json({ channel: canales.get(destinos.get(id)) });
    if (!canales.has(id)) return desconocido();
    if (operacion === "messages") {
      const anteriores = mensajes.get(id) ?? [];
      if (opciones.method === "GET") return json(anteriores);
      const datos = JSON.parse(opciones.body);
      assert.equal(datos.enforce_nonce, true);
      assert.equal(datos.nonce, id);
      const m = { ...datos, id: String(++secuencia), channel_id: id, author: { id: bot } };
      mensajes.set(id, [...anteriores, m]);
      if (fallos.perderMensaje) throw Error("Respuesta del mensaje perdida");
      return json(m);
    }
    if (operacion === "invites") {
      if (fallos.invitar) return json({}, 500);
      const code = "simulado" + (++secuencia);
      destinos.set(code, id);
      return json({ code, channel: { id }, expires_at: new Date(Date.now() + 600000).toISOString() });
    }
    if (opciones.method === "DELETE") {
      if (fallos.borrar) return json({}, 500);
      canales.delete(id);
    }
    return json(canales.get(id) ?? {});
  }
  return { transporte, canales, destinos, mensajes, auditoria, manual, fallos };
}
