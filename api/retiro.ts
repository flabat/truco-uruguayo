import type { PoolClient } from "pg";
import { reanudarComputadoras } from "./partidas.ts";

/**
 * Saca a un jugador de sus mesas dentro de la transacción de quien llama. Devuelve las mesas que cambiaron.
 * - Empezada y sin cierre del chico: una computadora juega su asiento, que sigue siendo humano para las reglas.
 * - Sin reparto: su asiento queda libre; si la creó, la mesa se cancela.
 * - Terminada: no cambia.
 */
export async function retirarJugador(db: PoolClient, jugador: string): Promise<string[]> {
  // El mismo orden de bloqueo en todos los retiros evita interbloqueos entre pedidos simultáneos.
  const { rows: mesas } = await db.query<{ id: string; creador: string; empezada: boolean; terminada: boolean; cedido: boolean }>(`
    SELECT m.id, m.creador, a.cedido,
           EXISTS (SELECT 1 FROM juego.manos h WHERE h.mesa = m.id) AS empezada,
           EXISTS (SELECT 1 FROM juego.eventos_chico e WHERE e.mesa = m.id AND e.evento->>'tipo' = 'cierre') AS terminada
      FROM juego.mesas m JOIN juego.asientos a ON a.mesa = m.id AND a.jugador = $1
     WHERE m.cancelada IS NULL
     ORDER BY m.id
       FOR UPDATE OF m`, [jugador]);
  const cambiadas: string[] = [];
  for (const mesa of mesas) {
    if (mesa.terminada || mesa.cedido) continue;
    if (mesa.empezada) {
      await db.query("UPDATE juego.asientos SET cedido = true WHERE mesa = $1 AND jugador = $2", [mesa.id, jugador]);
      await reanudarComputadoras(db, mesa.id);
    } else {
      await db.query("DELETE FROM juego.asientos WHERE mesa = $1 AND jugador = $2", [mesa.id, jugador]);
      if (mesa.creador === jugador) await db.query("UPDATE juego.mesas SET cancelada = now(), publica = false WHERE id = $1", [mesa.id]);
    }
    cambiadas.push(mesa.id);
  }
  return cambiadas;
}
