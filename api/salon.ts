import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { tableroEspectador } from "./tablero-espectador.ts";
import { jugadorDeSesion } from "./auth.ts";
import { ErrorPeticion, responderJson } from "./http.ts";
import { FalloDiscord } from "./discord.ts";
import type { crearVoz } from "./voz-discord.ts";
import { disponibleParaVoz } from "./publicacion-mesa.ts";
import { formatoMesa } from "./mesas.ts";
import { restaurar, type Registro } from "./turnos.ts";

const directorio = "/api/salon/mesas";
const detalle = /^\/api\/salon\/mesas\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(\/voz)?$/i;

interface Fila {
  id: string;
  modo: "1v1" | "2v2";
  meta: number;
  origen: "humana" | "exhibicion";
  version_senas: string | null;
  ultimo_hecho_publico: Date;
  fin_publico: Date | null;
  exhibicion_retirada: boolean;
  numero: number;
  puntos: [number, number];
  computadoras: boolean[];
}

interface FilaDetalle extends Fila {
  registro: Registro;
  version: number;
  politica: string;
  nombre_modelo: string | null;
  fecha_modelo: string | null;
}

// El evento en la posición exacta certifica el tanteador de esta versión de la mano.
// El directorio nunca selecciona el reparto. Cada consulta ve un solo snapshot de PostgreSQL.
const columnas = `m.id, m.modo, m.meta, m.origen, m.version_senas, m.ultimo_hecho_publico,
  m.fin_publico, m.exhibicion_retirada, h.numero,
  CASE WHEN h.cantidad=0 THEN h.puntos_inicio ELSE
    ARRAY[(e.evento->'puntos'->>0)::int, (e.evento->'puntos'->>1)::int] END AS puntos,
  ARRAY(SELECT a.computadora FROM juego.asientos a WHERE a.mesa=m.id ORDER BY asiento) AS computadoras`;

function manoActual(conRegistro: boolean) {
  return `JOIN LATERAL (
    SELECT numero, puntos_inicio, jsonb_array_length(acciones) AS cantidad
      ${conRegistro ? ", version, to_jsonb(mano) AS registro" : ""}
    FROM juego.manos mano WHERE mesa=m.id ORDER BY numero DESC LIMIT 1
  ) h ON true
  JOIN juego.eventos_chico e ON e.mesa=m.id AND e.mano=h.numero AND e.posicion=h.cantidad`;
}

function resumen(fila: Fila) {
  const computadoras = fila.computadoras.filter(Boolean).length;
  return {
    id: fila.id, modo: fila.modo, formato: formatoMesa(fila.modo, fila.version_senas), origen: fila.origen,
    humanos: fila.computadoras.length - computadoras, computadoras, manoNumero: fila.numero,
    puntos: fila.puntos, meta: fila.meta, ultimaActividad: fila.ultimo_hecho_publico.toISOString(),
  };
}

function responderVista(req: IncomingMessage, res: ServerResponse, vista: object) {
  const versionPublica = createHash("sha256").update(JSON.stringify(vista)).digest("hex");
  const tag = '"' + versionPublica + '"';
  res.setHeader("ETag", tag);
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie");
  const previos = req.headers["if-none-match"]?.split(",").map(t => t.trim().replace(/^W\//, ""));
  if (previos?.includes(tag) || previos?.includes("*")) {
    res.writeHead(304).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...vista, versionPublica }));
}

export function crearSalon(pool: Pool, habilitado: boolean, web: URL, voz?: ReturnType<typeof crearVoz>) {
  // Compartir solo el tablero neutral. Autorización, visibilidad, frescura y cierre
  // se leen de nuevo aun cuando el cliente tenga un ETag o la versión siga en memoria.
  const tableros = new Map<string, { version: number; numero: number; tablero: ReturnType<typeof tableroEspectador> }>();
  return async function atender(req: IncomingMessage, res: ServerResponse) {
    const ruta = (req.url ?? "").split("?")[0];
    const destino = detalle.exec(ruta);
    const pideVoz = Boolean(destino?.[2]);
    const metodo = pideVoz ? "POST" : "GET";
    if (req.method !== metodo) {
      res.setHeader("Allow", metodo);
      return responderJson(res, 405, { error: "Método no permitido." });
    }
    if (!await jugadorDeSesion(pool, req)) return responderJson(res, 401, { error: "Ingresá para mirar una mesa." });
    const ausente = () => responderJson(res, 404, { error: "No se encontró la mesa en el salón." });
    if (!habilitado) return ausente();
    if (ruta === directorio) {
      const { rows } = await pool.query<Fila>(`SELECT ${columnas}
        FROM juego.mesas_en_juego v JOIN juego.mesas m ON m.id=v.id ${manoActual(false)}
        ORDER BY (m.origen='exhibicion'), m.id`);
      return responderVista(req, res, { mesas: rows.map(resumen) });
    }
    const id = destino?.[1];
    if (!id) return ausente();
    if (pideVoz) {
      if (req.headers.origin !== web.origin) return responderJson(res, 403, { error: "El origen no corresponde al juego." });
      const { rows: [mesa] } = await pool.query<Pick<Fila, "modo">>(
        `SELECT m.modo FROM juego.mesas m WHERE m.id=$1 AND ${disponibleParaVoz}`, [id]);
      if (!mesa) return ausente();
      if (!voz) return responderJson(res, 503, { error: "La voz con Discord está desactivada." });
      try {
        return responderJson(res, 200, await voz.abrir(id, mesa.modo, true));
      } catch (error) {
        if (!(error instanceof ErrorPeticion)) throw error;
        if (error instanceof FalloDiscord && error.espera) res.setHeader("Retry-After", String(error.espera));
        return responderJson(res, error.status, { error: error.message });
      }
    }
    const { rows: [fila] } = await pool.query<FilaDetalle>(`
      SELECT ${columnas}, h.registro, h.version, m.politica,
        p.nombre AS nombre_modelo, to_char(p.publicada_el, 'YYYY-MM-DD') AS fecha_modelo
      FROM juego.mesas m ${manoActual(true)}
      LEFT JOIN juego.publicaciones_modelo p ON p.pin = m.politica
      WHERE m.id=$1 AND (${disponibleParaVoz}
        OR (m.publica AND m.exhibicion_retirada AND m.ultimo_hecho_publico IS NOT NULL AND m.fin_publico IS NULL))`, [id]);
    if (!fila) return ausente();
    const mesa = resumen(fila);
    let actual = tableros.get(fila.id);
    const indicaciones = fila.version_senas === versionSenasPie ? fila.registro.indicaciones : undefined;
    if (!actual || actual.version !== fila.version || actual.numero !== fila.numero
      || actual.tablero.indicaciones?.length !== indicaciones?.length) {
      const { estado } = restaurar(fila.registro, mesa.formato, fila.meta);
      actual = { version: fila.version, numero: fila.numero, tablero: tableroEspectador(estado, indicaciones) };
      if (!tableros.has(fila.id) && tableros.size >= 128) tableros.delete(tableros.keys().next().value!);
      tableros.set(fila.id, actual);
    }
    const asientos = fila.computadoras.map((cpu, asiento) => ({
      asiento, equipo: asiento % 2, tipo: cpu ? "computadora" : "humano",
      nombre: (cpu ? "Computadora " : "Jugador ") + (asiento + 1),
    }));
    const estado = fila.fin_publico ? "terminada" : fila.exhibicion_retirada ? "interrumpida" : "en-juego";
    responderVista(req, res, {
      ...mesa, asientos, estado, versionReglas: fila.registro.version_reglas, politica: fila.politica,
      edicionModelo: fila.nombre_modelo == null ? undefined : { nombre: fila.nombre_modelo, publicado: fila.fecha_modelo },
      vozDisponible: Boolean(voz) && estado !== "interrumpida", tablero: actual.tablero,
    });
  };
}
