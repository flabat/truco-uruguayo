import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import type { Partida, PartidaTercetos } from "./cliente";

export function ReporteDeJugada({ mesaId, partida, vuelta, presentando, voz }: {
  mesaId: string;
  partida: Partida | PartidaTercetos;
  vuelta: number;
  presentando: boolean;
  voz?: number;
}) {
  if (!partida.vista) return null;
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
  const cliente = import.meta.env.INTERFAZ_COMMIT;
  return <form action={"/api/mesas/" + encodeURIComponent(mesaId) + "/reportes"} method="post" target="_blank" rel="noopener">
    <input type="hidden" name="mano" value={partida.manoNumero} />
    <input type="hidden" name="posicion" value={posicion} />
    {partida.versionSenas === versionSenasPie && <input type="hidden" name="indicaciones" value={partida.indicaciones?.length ?? 0} />}
    <input type="hidden" name="vuelta" value={vuelta} />
    <input type="hidden" name="puntos" value={partida.puntos.join("-")} />
    <input type="hidden" name="fase" value={fase} />
    {duelo != null && <input type="hidden" name="duelo" value={duelo} />}
    {voz != null && <input type="hidden" name="voz" value={voz} />}
    {cliente && <input type="hidden" name="cliente" value={cliente} />}
    <button type="submit" className="j-link j-reportar" title="Abrir un borrador en GitHub en otra pestaña">
      Reportar esta jugada <span aria-hidden="true">↗</span>
    </button>
  </form>;
}
