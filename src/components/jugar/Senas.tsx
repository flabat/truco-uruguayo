import { useState } from "react";
import { signals, type Signal } from "../../../training/contracts/index";
import { cartasPorId } from "../../lib/cartas";
import juego from "../../data/juego.json";
import { EnJuego } from "./Tablero";
import type { Eleccion, Mesa, Partida } from "./cliente";
import "./senas.css";

const filas = juego.find(seccion => seccion.id === "senas")!.blocks.find(b => b.table)!.table!.rows;
const menu = signals.map((id, i) => ({ id, texto: filas[i][1].replace(/\.$/, "") }));

export function MesaConSenas({ base, mesa, partida, bloqueada, mostrandoCartas, jugar }: {
  base: string; mesa: Mesa; partida: Partida; bloqueada: boolean; mostrandoCartas: boolean;
  jugar: (accion?: Eleccion & { sena?: Signal }) => void;
}) {
  const [seleccion, elegir] = useState<{version: number; sena: Signal | ""}>();
  const sena = seleccion?.version === partida.version ? seleccion.sena : "";
  const historial = (partida.turnos ?? []).filter(t => t.signal);
  return <>
    {Boolean(partida.vista?.legales.length) && (
      <div className="j-elegir-sena">
        <label htmlFor="proxima-sena">Seña para esta jugada</label>
        <select id="proxima-sena" value={sena} disabled={bloqueada}
          aria-describedby="alcance-sena"
          onChange={e => elegir({version:partida.version, sena:e.target.value as Signal | ""})}>
          <option value="">Silencio</option>
          {menu.map(s => <option key={s.id} value={s.id}>{s.texto}</option>)}
        </select>
        <small id="alcance-sena">La seña la ven vos y tu compañero al confirmar la jugada.</small>
      </div>
    )}
    <EnJuego base={base} mesa={mesa} partida={partida} bloqueada={bloqueada} mostrandoCartas={mostrandoCartas}
      jugar={accion => jugar(accion && sena ? {...accion, sena} : accion)} />
    {historial.length > 0 && (
      <section className="j-senas-vistas" aria-label="Señas de esta mano">
        <h3>Señas de esta mano</h3>
        <ol>{historial.map((turn, i) => {
          const {action} = turn;
          const gesto = menu.find(s => s.id === turn.signal)!.texto;
          const jugada = action.tipo === "carta" ? cartasPorId.get(action.carta)!.nombre
            : action.tipo === "paso-flor" ? "Sin flor" : action.tipo.replaceAll("-", " ");
          return <li key={i}><strong>{mesa.asientos[action.asiento].nombre}</strong> · {gesto} · {jugada}</li>;
        })}</ol>
      </section>
    )}
  </>;
}
