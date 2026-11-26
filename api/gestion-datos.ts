import type { Pool, PoolClient } from "pg";
import { marcadorOnline } from "@eltruco/motor/mesa-online.ts";
import { ErrorPeticion } from "./http.ts";
import { formatoMesa } from "./mesas.ts";
import { restaurarTercetosDB, type RegistroTercetos } from "./partidas-tercetos.ts";
import { restaurar } from "./turnos.ts";

type Recurso = "vivo" | "historial" | "jugadores";
type Conexiones = ReadonlyMap<string, ReadonlySet<string>>;
type Puntos = [number, number];
const porPagina = 25;
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

// Los registros anteriores a los eventos de replay conservan el reparto y sus acciones.
// Solo se reconstruye la última mano, sin avanzar turnos ni producir una vista de jugador.
interface FaltaMarcador {
  id: string;
  modo: "1v1" | "2v2" | "3v3";
  meta: number;
  mano: number;
  version: number;
  version_senas: string | null;
}
const caches = new WeakMap<Pool, Map<string, Puntos | null>>();
async function marcadoresAnteriores(db: PoolClient, pool: Pool, condicion: string, valores: unknown[]) {
  const { rows } = await db.query<FaltaMarcador>(`
    SELECT m.id, m.modo, m.meta, m.mano, m.version, origen.version_senas
      FROM juego.marcadores_gestion m JOIN juego.mesas origen USING (id)
     WHERE m.mano > 0 AND m.puntos IS NULL AND ${condicion}`, valores);
  const cache = caches.get(pool) ?? new Map<string, Puntos | null>();
  caches.set(pool, cache);
  const resultados: {id: string; puntos: Puntos}[] = [];
  const faltan: FaltaMarcador[] = [];
  const clave = (g: FaltaMarcador) => [g.id, g.mano, g.version, g.meta].join("/");
  for (const g of rows) {
    const puntos = cache.get(clave(g));
    if (puntos) resultados.push({id: g.id, puntos});
    else if (puntos === undefined) faltan.push(g);
  }
  for (let i = 0; i < faltan.length; i += 200) {
    const lote = faltan.slice(i, i + 200);
    const { rows: manos } = await db.query<RegistroTercetos>(`
      SELECT h.* FROM unnest($1::uuid[], $2::integer[]) WITH ORDINALITY a(id, mano, orden)
      JOIN juego.manos h ON h.mesa=a.id AND h.numero=a.mano ORDER BY a.orden`,
      [lote.map(g => g.id), lote.map(g => g.mano)]);
    for (const [j, g] of lote.entries()) {
      let puntos: Puntos | null = null;
      try {
        const formato = formatoMesa(g.modo, g.version_senas);
        const estado = formato === "triples" ? restaurarTercetosDB(manos[j]) : restaurar(manos[j], formato, g.meta).estado;
        puntos = marcadorOnline(estado);
        resultados.push({id: g.id, puntos});
      } catch {
        // Una mano histórica ilegible conserva la mesa y sus equipos, con tanteador desconocido.
      }
      if (cache.size >= 2048) cache.delete(cache.keys().next().value!);
      cache.set(clave(g), puntos);
    }
  }
  return resultados;
}

function fechaUTC(valor: string | null) {
  if (!valor) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.startsWith("0000")) throw new ErrorPeticion(400, "Fecha inválida.");
  const fecha = new Date(valor + "T00:00:00Z");
  if (!Number.isFinite(fecha.getTime()) || !fecha.toISOString().startsWith(valor + "T")) throw new ErrorPeticion(400, "Fecha inválida.");
  return valor;
}

function marcadores(legados: string) {
  return `anteriores AS (SELECT * FROM jsonb_to_recordset(${legados}::jsonb) AS a(id uuid, puntos integer[])),
    tanteo AS (
      SELECT g.id, g.modo, g.meta, g.mano, g.inicio, g.fin, coalesce(g.puntos,a.puntos) AS puntos
        FROM juego.marcadores_gestion g LEFT JOIN anteriores a USING (id)
    ), mesas AS (
      SELECT t.*, coalesce((SELECT (c.evento->>'ganador')::integer FROM juego.eventos_chico c
          WHERE c.mesa=t.id AND c.evento->>'tipo'='cierre' AND c.evento->>'estado'='abandonado' LIMIT 1),
        CASE WHEN puntos[1] >= meta THEN 0 WHEN puntos[2] >= meta THEN 1 END) AS ganador FROM tanteo t
    )`;
}

const asientos = `(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'asiento', a.asiento, 'equipo', a.asiento % 2, 'jugador', a.jugador,
  'tipo', CASE WHEN a.computadora THEN 'computadora' ELSE 'humano' END,
  'nombre', CASE WHEN a.computadora THEN 'Computadora ' || (a.asiento + 1) ELSE j.nombre END
) ORDER BY a.asiento),'[]'::jsonb) FROM juego.asientos a LEFT JOIN juego.jugadores j ON j.id=a.jugador WHERE a.mesa=m.id)`;

function buscar(columna: string, variable: string) {
  // strpos trata los signos % y _ como texto; los nombres se buscan también sin tilde.
  return `strpos(translate(lower(${columna}), 'áéíóúüñ', 'aeiouun'), ${variable}) > 0`;
}

function agregar(valores: unknown[], valor: unknown) {
  valores.push(valor);
  return "$" + valores.length;
}

async function paginar(db: PoolClient, seleccion: string, columnas: string, orden: string,
    valores: unknown[], pagina: number) {
  // El total también se devuelve si el cliente pide una página que ya quedó vacía.
  const {rows: [resultado]} = await db.query(seleccion + `
    SELECT (SELECT count(*)::int FROM seleccion) AS total, coalesce((
      SELECT jsonb_agg(to_jsonb(fila)) FROM (
        SELECT ${columnas} FROM seleccion m ORDER BY ${orden} LIMIT ${porPagina} OFFSET $${valores.length + 1}
      ) fila
    ), '[]'::jsonb) AS elementos`, [...valores, (pagina - 1) * porPagina]);
  return {...resultado, pagina, porPagina};
}

async function leerJugadores(db: PoolClient, pool: Pool, params: URLSearchParams, q: string,
    conexiones: Conexiones, pagina: number) {
  const sesion = "EXISTS (SELECT 1 FROM juego.sesiones s WHERE s.jugador=j.id AND s.vence>now())";
  const {elementos, total} = await paginar(db, `WITH seleccion AS (
    SELECT j.id, j.nombre, ${sesion} AS "sesionVigente" FROM juego.jugadores j
    WHERE ${buscar("j.nombre","$1")} AND (NOT $2::boolean OR ${sesion})
  )`, "m.*", "lower(m.nombre), m.id", [q, params.get("vigentes")==="1"], pagina);
  if (elementos.length) {
    const ids: string[] = elementos.map((j: {id: string}) => j.id);
    const legados = await marcadoresAnteriores(db, pool,
      "EXISTS (SELECT 1 FROM juego.asientos a WHERE a.jugador=ANY($1::uuid[]) AND a.mesa=m.id)", [ids]);
    const {rows: totales} = await db.query(`WITH ${marcadores("$2")}
      SELECT a.jugador, count(*)::int AS terminadas, count(*) FILTER (WHERE p.ganador=a.asiento % 2 AND a.salida IS NULL)::int AS ganadas
      FROM juego.asientos a JOIN mesas p ON p.id=a.mesa WHERE a.jugador=ANY($1::uuid[]) AND p.ganador IS NOT NULL
      GROUP BY a.jugador`, [ids, JSON.stringify(legados)]);
    for (const j of elementos) {
      const estadistica = totales.find(fila => fila.jugador === j.id);
      j.terminadas = estadistica?.terminadas ?? 0;
      j.ganadas = estadistica?.ganadas ?? 0;
      j.mesasConectadas = [...conexiones].filter(([, personas]) => personas.has(j.id)).map(([id]) => id).sort();
    }
  }
  return {elementos,total,pagina,porPagina};
}

function filtrosHistorial(params: URLSearchParams, q: string, valores: unknown[]) {
  const filtros = ["m.mano>0"];
  const modo = params.get("modo");
  if (modo && !["1v1","2v2","3v3"].includes(modo)) throw new ErrorPeticion(400, "Modalidad inválida.");
  if (modo) filtros.push("m.modo=" + agregar(valores,modo));
  const jugador = params.get("jugador");
  if (jugador && !uuid.test(jugador)) throw new ErrorPeticion(400, "Jugador inválido.");
  if (jugador) filtros.push(`EXISTS (SELECT 1 FROM juego.asientos a WHERE a.mesa=m.id AND a.jugador=${agregar(valores,jugador)})`);
  if (q) {
    const texto = agregar(valores,q);
    filtros.push(`(strpos(m.id::text,${texto})>0 OR EXISTS (SELECT 1 FROM juego.asientos a
      JOIN juego.jugadores j ON j.id=a.jugador WHERE a.mesa=m.id AND ${buscar("j.nombre",texto)}))`);
  }
  const desde = fechaUTC(params.get("desde"));
  const hasta = fechaUTC(params.get("hasta"));
  if (desde && hasta && desde>hasta) throw new ErrorPeticion(400, "El intervalo de fechas es inválido.");
  if (desde) filtros.push("left(coalesce(m.fin,m.inicio),10)>=" + agregar(valores,desde));
  if (hasta) filtros.push("left(coalesce(m.fin,m.inicio),10)<=" + agregar(valores,hasta));
  return filtros.join(" AND ");
}

async function leerMesasGestion(db: PoolClient, pool: Pool, vivo: boolean, params: URLSearchParams, q: string,
    conexiones: Conexiones, pagina: number) {
  const valores: unknown[] = [];
  let orden = "coalesce(m.fin,m.inicio) DESC NULLS LAST, m.id";
  let contadores;
  let legados: {id: string; puntos: Puntos}[] = [];
  let condicion;
  let paginarAntesDeReconstruir = false;
  if (vivo) {
    const ids = [...conexiones.keys()];
    const conectada = `m.id=ANY(${agregar(valores,ids)}::uuid[])`;
    legados = ids.length ? await marcadoresAnteriores(db, pool, conectada, valores) : [];
    const {rows: [stats]} = await db.query(`WITH ${marcadores("$2")}
      SELECT (SELECT count(DISTINCT jugador)::int FROM juego.sesiones WHERE vence>now()) AS "sesionesVigentes",
             count(*)::int AS "partidasEnCurso" FROM mesas m
       WHERE m.mano>0 AND m.ganador IS NULL AND ${conectada}`, [ids, JSON.stringify(legados)]);
    const personas = new Set<string>();
    for (const grupo of conexiones.values()) for (const persona of grupo) personas.add(persona);
    contadores = {...stats, personasConectadas: personas.size};
    condicion = `(${conectada} OR NOT EXISTS (SELECT 1 FROM juego.manos h WHERE h.mesa=m.id))`;
    orden = `(${conectada}) DESC, ` + orden;
  } else {
    condicion = filtrosHistorial(params,q,valores);
    const estado = params.get("estado");
    if (estado && estado !== "terminada" && estado !== "sin-terminar") throw new ErrorPeticion(400, "Estado de partida inválido.");
    if (estado) {
      legados = await marcadoresAnteriores(db, pool, condicion, valores);
      condicion += estado === "terminada" ? " AND m.ganador IS NOT NULL" : " AND m.ganador IS NULL";
    } else {
      // Sin filtro de resultado, los tanteadores no afectan qué mesas forman la página.
      paginarAntesDeReconstruir = true;
    }
  }
  const cte = marcadores(agregar(valores,JSON.stringify(legados)));
  const paginaMesas = await paginar(db,
    `WITH ${cte}, seleccion AS (SELECT m.* FROM mesas m WHERE ${condicion})`, `m.*, ${asientos} AS asientos`, orden, valores, pagina);
  const sinTanteo = paginaMesas.elementos.filter((m: {mano: number; puntos: Puntos | null}) => m.mano>0 && m.puntos===null);
  if (paginarAntesDeReconstruir && sinTanteo.length) {
    const pendientes = sinTanteo.map((m: {id: string}) => m.id);
    const resultados = await marcadoresAnteriores(db, pool, "m.id=ANY($1::uuid[])", [pendientes]);
    for (const m of sinTanteo) {
      m.puntos = resultados.find(r => r.id === m.id)?.puntos ?? null;
      if (m.puntos && m.ganador === null) {
        const ganador = m.puntos.findIndex((n: number) => n >= m.meta);
        m.ganador = ganador < 0 ? null : ganador;
      }
    }
  }
  for (const m of paginaMesas.elementos) {
    m.estado = m.mano===0 ? "esperando" : m.ganador===null ? "sin-terminar" : "terminada";
    const personas = conexiones.get(m.id);
    for (const asiento of m.asientos) asiento.conectado = personas?.has(asiento.jugador) ?? false;
  }
  return {...contadores,...paginaMesas};
}

export async function leerGestion(pool: Pool, recurso: Recurso, params: URLSearchParams, conexiones: Conexiones) {
  const pagina = Number(params.get("pagina") ?? "1");
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger(pagina * porPagina)) {
    throw new ErrorPeticion(400, "Página inválida.");
  }
  const q = (params.get("q") ?? "").trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (q.length > 200) throw new ErrorPeticion(400, "La búsqueda es demasiado larga.");
  const db = await pool.connect();
  try {
    // El cierre, el tanteador, los equipos y la paginación corresponden a un solo instante.
    await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const resultado = recurso === "jugadores"
      ? await leerJugadores(db, pool, params, q, conexiones, pagina)
      : await leerMesasGestion(db, pool, recurso === "vivo", params, q, conexiones, pagina);
    await db.query("COMMIT");
    return resultado;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
