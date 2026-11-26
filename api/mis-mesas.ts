import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { MesaRetomable } from "@eltruco/cliente/salon.ts";
import { aDecidir, marcadorOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { jugadorDeSesion } from "./auth.ts";
import { responderJson } from "./http.ts";
import { formatoMesa } from "./mesas.ts";
import { recuperarMano } from "./partidas.ts";
import { vistaPiePrivada } from "./partidas-pie.ts";
import type { RegistroTercetos } from "./partidas-tercetos.ts";

interface FilaMesa {
  id: string;
  modo: MesaRetomable["modo"];
  meta: number;
  asiento: Asiento;
  participantes: string[];
  humanos: number[];
  esperan: number[];
  actividad: Date | null;
  politica: string;
  version_senas: string | null;
  numero: number | null;
  revision: string | null;
  registro: RegistroTercetos | null;
}

type EstadoDeAsiento = Pick<MesaRetomable, "puntos" | "teToca">;
type Recordado = { revision: string; estado: EstadoDeAsiento | null };

function resumirMano(fila: FilaMesa, registro: RegistroTercetos): EstadoDeAsiento | null {
  // También reconoce el final de chicos anteriores al registro de eventos de cierre.
  // Leer la última mano guardada no reparte ni hace jugar a ninguna computadora.
  const { modo, meta, asiento } = fila;
  if (registro.version_senas !== fila.version_senas) return null;
  const mano = recuperarMano(registro, formatoMesa(modo, fila.version_senas), meta, fila.humanos);
  const puntos = marcadorOnline(mano.estado);
  if (puntos.some(tantos => tantos >= meta)) return null;
  const equipo = asiento % 2;
  mano.politicaPie = fila.politica;
  const pie = mano.indicaciones && vistaPiePrivada(mano, asiento, fila.esperan);
  return {
    puntos: [puntos[equipo], puntos[1 - equipo]],
    teToca: pie?.esperando !== undefined || (pie?.responde === undefined && aDecidir(mano.estado).includes(asiento)),
  };
}

async function leerMesas(pool: Pool, jugador: string, anteriores: ReadonlyMap<string, Recordado>) {
  const revisiones = Object.fromEntries(Array.from(anteriores, ([id, r]) => [id, r.revision]));
  const { rows } = await pool.query<FilaMesa>(`
    SELECT m.id, m.modo, m.meta, m.politica, m.version_senas, propio.asiento,
           ocupantes.participantes, ocupantes.humanos, ocupantes.esperan, h.numero, h.revision,
           CASE WHEN h.revision IS DISTINCT FROM ($2::jsonb ->> m.id::text) THEN to_jsonb(h.registro) END AS registro,
           coalesce(m.actividad_jugadores, (r.cabecera->>'inicio')::timestamptz) AS actividad
      FROM juego.asientos propio JOIN juego.mesas m ON m.id = propio.mesa
      CROSS JOIN LATERAL (
        SELECT coalesce(array_agg(CASE WHEN a.computadora OR a.cedido THEN 'Computadora ' || (a.asiento + 1)
                                      ELSE j.nombre END ORDER BY a.asiento)
                          FILTER (WHERE a.asiento <> propio.asiento), '{}'::text[]) AS participantes,
               array_agg(a.asiento ORDER BY a.asiento) FILTER (WHERE NOT a.computadora) AS humanos,
               array_agg(a.asiento ORDER BY a.asiento) FILTER (WHERE NOT a.computadora AND NOT a.cedido) AS esperan
          FROM juego.asientos a LEFT JOIN juego.jugadores j ON j.id = a.jugador
         WHERE a.mesa = m.id
      ) ocupantes
      LEFT JOIN LATERAL (
        SELECT ultima AS registro, ultima.numero,
               concat_ws('/', ultima.numero, ultima.version, ultima.xmin, m.xmin, propio.asiento,
                         ocupantes.humanos, ocupantes.esperan) AS revision
          FROM juego.manos ultima
         WHERE ultima.mesa = m.id ORDER BY ultima.numero DESC LIMIT 1
      ) h ON true
      LEFT JOIN juego.replays_chico r ON r.mesa = m.id
     WHERE propio.jugador = $1 AND NOT propio.cedido AND propio.salida IS NULL AND m.cancelada IS NULL AND NOT m.solo_computadoras
       AND NOT EXISTS (SELECT 1 FROM juego.eventos_chico c WHERE c.mesa = m.id AND c.evento->>'tipo' = 'cierre')
     ORDER BY actividad DESC NULLS LAST, m.id`, [jugador, JSON.stringify(revisiones)]);

  const mesas: MesaRetomable[] = [];
  const actuales = new Map<string, Recordado>();
  for (const fila of rows) {
    let estado: EstadoDeAsiento | null = { puntos: null, teToca: false };
    if (fila.revision !== null) {
      if (fila.registro) {
        try {
          estado = resumirMano(fila, fila.registro);
        } catch {
          // Un reparto histórico incompatible no puede retomarse con este árbitro.
          estado = null;
        }
      } else {
        estado = anteriores.get(fila.id)!.estado;
      }
      if (actuales.size < 256) actuales.set(fila.id, { revision: fila.revision, estado });
    }
    if (estado) mesas.push({
      id: fila.id, modo: fila.modo, participantes: fila.participantes, meta: fila.meta,
      mano: fila.numero, ...estado, ultimaActividad: fila.actividad?.toISOString() ?? null,
    });
  }
  return { mesas, actuales };
}

export function crearMisMesas(pool: Pool) {
  // La consulta verifica los asientos en cada petición. La revisión usa xmin de la
  // mesa y la mano, que cambia incluso al pasar sin indicación sin subir la versión.
  // En memoria sólo quedan tanteador y turno de ese jugador, nunca cartas o señas.
  const porJugador = new Map<string, ReadonlyMap<string, Recordado>>();
  return async function atender(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return responderJson(res, 405, { error: "Método no permitido." });
    }
    const jugador = await jugadorDeSesion(pool, req);
    if (!jugador) return responderJson(res, 401, { error: "Ingresá para ver tus mesas." });
    const { mesas, actuales } = await leerMesas(pool, jugador.id, porJugador.get(jugador.id) ?? new Map());
    porJugador.delete(jugador.id);
    if (actuales.size) {
      if (porJugador.size >= 128) porJugador.delete(porJugador.keys().next().value!);
      porJugador.set(jugador.id, actuales);
    }
    responderJson(res, 200, { jugadorId: jugador.id, mesas });
  };
}
