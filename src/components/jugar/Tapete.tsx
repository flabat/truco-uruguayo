import type { ReactNode } from "react";
import type { CardId } from "../../motor/cartas";
import type { ResultadoVuelta, Vuelta } from "../../motor/mano";
import { nombrar } from "./HistorialDeMano";
import "./tapete.css";

interface Puesto {
  asiento: number;
  nombre: string | null;
  papel: string;
  etiqueta?: string;
}

interface DetallePuesto {
  contenido?: ReactNode;
  reemplazaJugada?: boolean;
  mano?: ReactNode;
}

interface Props {
  base: string;
  asientos: readonly Puesto[];
  asientoInferior: number;
  dador: number;
  mano: number;
  muestra: CardId;
  manoNumero: number;
  numeroVuelta: number;
  vuelta?: (Vuelta & { resultado?: ResultadoVuelta }) | null;
  terminada?: boolean;
  detalle?: (asiento: number, carta: CardId | undefined, ganadora: boolean) => DetallePuesto;
}

const posicionesParejas = ["vos", "derecha", "frente", "izquierda"];
const posicionesDuelo = ["vos", "frente"];

export function Naipe({ id, base }: { id: CardId; base: string }) {
  return <img src={base + "img/cartas/tatu/" + id + ".webp"} width={384} height={596} alt={nombrar(id)} />;
}

function MuestraConMazo({ carta, base }: { carta: CardId; base: string }) {
  const nombre = nombrar(carta);
  return <div className="j-muestra" role="img" aria-label={"Muestra " + nombre}>
    <div aria-hidden="true">
      <Naipe base={base} id={carta} />
      <img className="j-mazo" src={base + "img/cartas/tatu/reverso.webp"} alt="" width={384} height={596} />
    </div>
    <small aria-hidden="true">Muestra</small>
    <strong aria-hidden="true">{nombre}</strong>
  </div>;
}

export function Tapete({
  base, asientos, asientoInferior, dador, mano, muestra, manoNumero, numeroVuelta, vuelta, terminada, detalle,
}: Props) {
  const posiciones = asientos.length === 2 ? posicionesDuelo : posicionesParejas;
  const resultado = vuelta?.resultado;
  const ganador = resultado?.tipo === "ganada" ? resultado.asiento : undefined;
  const veredicto = resultado?.tipo === "parda" ? "Parda" :
    ganador != null ? "Ganó " + asientos.find(a => a.asiento === ganador)?.nombre : undefined;

  return <section className="j-tapete" aria-label="Tapete">
    <header>
      <strong>Mano {manoNumero}</strong>
      <div className="j-estado-vuelta">
        <span>{terminada ? "Terminada" : "Vuelta " + numeroVuelta}</span>
        {veredicto && <b>{veredicto}</b>}
      </div>
    </header>
    <div className={"j-puestos" + (asientos.length === 2 ? " j-duelo" : "")}>
      {asientos.map(a => {
        const posicion = posiciones[(a.asiento - asientoInferior + posiciones.length) % posiciones.length];
        const carta = vuelta?.jugadas.find(j => j.asiento === a.asiento)?.carta;
        const ganadora = ganador === a.asiento;
        const extra = detalle?.(a.asiento, carta, ganadora);
        return <div key={a.asiento} className={"j-puesto j-" + posicion} role="group" aria-label={a.etiqueta ?? a.nombre ?? undefined}>
          <div className="j-ocupante">
            <div className="j-persona">
              <b>{a.nombre}</b>
              <span>{a.papel}{a.asiento === dador && " · Dador"}{a.asiento === mano && " · Mano"}</span>
            </div>
            {extra?.contenido}
            {carta && !extra?.reemplazaJugada && <div className={ganadora ? "j-jugada j-ganadora" : "j-jugada"}>
              <Naipe base={base} id={carta} />
              {ganadora && <small>Ganó la vuelta</small>}
            </div>}
          </div>
          {a.asiento === dador && <MuestraConMazo base={base} carta={muestra} />}
          {extra?.mano}
        </div>;
      })}
    </div>
  </section>;
}
