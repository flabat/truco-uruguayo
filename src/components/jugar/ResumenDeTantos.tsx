import type { ResumenTantos } from "@eltruco/motor/resumen-tantos.ts";
import type { AccionOnline, EstadoOnline } from "@eltruco/motor/cantos-online.ts";
import { motivoDelCobro } from "@eltruco/cliente/cobros.ts";
import { tantos } from "@eltruco/cliente/textos.ts";

export function ResumenDeTantos({ resumen, propio, equipo, acciones = [], resultado = null, titulo = "Tantos de esta mano", detalle = true, nombre }: {
  resumen: ResumenTantos; propio: number; equipo: (e: number) => string;
  acciones?: readonly AccionOnline[]; resultado?: EstadoOnline["resultado"]; titulo?: string; detalle?: boolean; nombre?: (asiento: number) => string;
}) {
  return <section className="j-resumen-tantos" aria-label={titulo}>
    <h3>{titulo}</h3>
    <ul>{[propio, 1 - propio].map(e => <li key={e}>
      <strong>{equipo(e)} · {resumen.totales[e] > 0 ? "+" : ""}{tantos(resumen.totales[e])}</strong>
      {detalle && resumen.cobros.some(c => c.equipo === e) && <ul>
        {resumen.cobros.filter(c => c.equipo === e).map((c, i) => <li key={i}>
          {tantos(c.tantos)} por {motivoDelCobro(c, acciones, resultado)}
          {c.tantoGanador != null && ` (${c.asiento != null && nombre ? nombre(c.asiento) + " con " : ""}${c.tantoGanador})`}
          {c.valor != null && c.valor !== c.tantos && ` (valor de la apuesta: ${tantos(c.valor)})`}
        </li>)}
      </ul>}
    </li>)}</ul>
  </section>;
}
