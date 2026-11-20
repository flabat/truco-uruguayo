import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { marcadorOnline } from "../src/motor/mesa-online.ts";
import type { ResumenPartida, PerfilJugador } from "../src/lib/perfil.ts";
import { jugadorDeSesion } from "./auth.ts";
import { responderJson } from "./http.ts";
import { formatoMesa } from "./mesas.ts";
import { restaurarTercetosDB, type RegistroTercetos } from "./partidas-tercetos.ts";
import { restaurar } from "./turnos.ts";

interface FilaPartida {
  id: string;
  modo: ResumenPartida["modo"];
  meta: number;
  mano: number;
  equipo: number;
  version_senas: string | null;
  fecha: string | null;
  puntos: [number, number] | null;
  registro: RegistroTercetos | null;
}

function resumen(fila: FilaPartida): ResumenPartida {
  let puntos = fila.puntos;
  if (fila.registro) {
    // Las manos anteriores al registro de replays conservan sus acciones en PostgreSQL.
    try {
      const formato = formatoMesa(fila.modo, fila.version_senas);
      const estado = formato === "triples" ? restaurarTercetosDB(fila.registro)
        : restaurar(fila.registro, formato, fila.meta).estado;
      puntos = marcadorOnline(estado);
    } catch {
      // Un registro de reglas desconocidas sigue en el historial con resultado sin datos.
    }
  }
  const ganador = puntos?.findIndex(tantos => tantos >= fila.meta);
  const resultado = ganador === undefined ? "desconocido" : ganador === -1 ? "sin-terminar"
    : ganador === fila.equipo ? "ganada" : "perdida";
  return {
    id: fila.id, modo: fila.modo, fecha: fila.fecha, resultado, meta: fila.meta, mano: fila.mano,
    puntos: puntos ? { propios: puntos[fila.equipo], rivales: puntos[1 - fila.equipo] } : null,
  };
}

const limite = 20;

export async function atenderPerfil(pool: Pool, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    responderJson(res, 405, { error: "Método no permitido." });
    return;
  }
  const jugador = await jugadorDeSesion(pool, req);
  if (!jugador) {
    responderJson(res, 401, { error: "Ingresá para ver tu perfil." });
    return;
  }
  const params = new URL(req.url!, "http://localhost").searchParams;
  const pagina = Number(params.get("pagina") ?? "1");
  const offset = (pagina - 1) * limite;
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger(offset)) {
    responderJson(res, 400, { error: "Página inválida." });
    return;
  }

  // La cuenta sale de la cookie y el asiento acredita que participó. Solo entran mesas con reparto.
  const { rows } = await pool.query<FilaPartida>(`
    WITH pagina AS (
      SELECT m.id, m.modo, m.meta, m.version_senas, a.asiento % 2 AS equipo,
             h.numero AS mano, h.puntos_inicio, h.cantidad,
             coalesce(c.evento->>'fecha', r.cabecera->>'inicio') AS fecha
        FROM juego.asientos a JOIN juego.mesas m ON m.id=a.mesa
        JOIN LATERAL (
          SELECT numero, puntos_inicio, jsonb_array_length(acciones) AS cantidad
            FROM juego.manos WHERE mesa=m.id ORDER BY numero DESC LIMIT 1
        ) h ON true
        LEFT JOIN juego.replays_chico r ON r.mesa=m.id
        LEFT JOIN juego.eventos_chico c ON c.mesa=m.id AND c.evento->>'tipo'='cierre'
       WHERE a.jugador=$1
       ORDER BY fecha DESC NULLS LAST, m.id
       LIMIT $2 OFFSET $3
    )
    SELECT p.id, p.modo, p.meta, p.version_senas, p.equipo, p.mano, p.fecha,
           CASE WHEN p.cantidad=0 THEN p.puntos_inicio
                WHEN d.evento->>'tipo'='decision'
                THEN ARRAY[(d.evento->'puntos'->>0)::integer, (d.evento->'puntos'->>1)::integer] END AS puntos,
           CASE WHEN p.cantidad>0 AND d.evento IS NULL THEN to_jsonb(h) END AS registro
      FROM pagina p
      LEFT JOIN juego.eventos_chico d ON d.mesa=p.id AND d.mano=p.mano AND d.posicion=p.cantidad
      LEFT JOIN juego.manos h ON h.mesa=p.id AND h.numero=p.mano AND p.cantidad>0 AND d.evento IS NULL
     ORDER BY p.fecha DESC NULLS LAST, p.id`, [jugador.id, limite + 1, offset]);

  const perfil: PerfilJugador = { jugador, partidas: rows.slice(0, limite).map(resumen), hayMas: rows.length > limite };
  responderJson(res, 200, perfil);
}
