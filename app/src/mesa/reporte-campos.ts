import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";

/**
 * Los campos ocultos del formulario de `ReporteDeJugada` en la mesa web, sin el commit de la
 * interfaz (`cliente`), que la app no tiene.
 */
export function camposDelReporte(partida: Partida | PartidaTercetos, vuelta: number, presentando: boolean, voz?: number) {
  let posicion = partida.vista.acciones.length;
  let duelo: number | null = null;
  if (partida.formato === "triples") {
    duelo = partida.lance.duelo;
    // Al cerrar el reparto, el último resumen contiene las mismas acciones que la vista.
    for (const lance of partida.historialLances) {
      if (lance.duelo !== duelo) posicion += lance.acciones.length;
    }
  }
  const fase = presentando || voz != null ? "presentacion" : partida.vista.resultado ? "resultado" : "jugada";
  const campos: Record<string, string> = {
    mano: String(partida.manoNumero),
    posicion: String(posicion),
    ...(partida.versionSenas === versionSenasPie && { indicaciones: String(partida.indicaciones?.length ?? 0) }),
    vuelta: String(vuelta),
    puntos: partida.puntos.join("-"),
    fase,
  };
  if (duelo != null) campos.duelo = String(duelo);
  if (voz != null) campos.voz = String(voz);
  return campos;
}
