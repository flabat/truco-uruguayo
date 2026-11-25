import type { ReactNode } from "react";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { ResultadoVuelta, Vuelta } from "@eltruco/motor/mano.ts";
import { useGloboDelCompanero, type PieEnTapete } from "./GloboDelCompanero";
import { nombrar } from "@eltruco/cliente/textos.ts";
import "./tapete.css";

interface Puesto {
  asiento: number;
  nombre: string | null;
  papel?: string;
  etiqueta?: string;
}

interface DetallePuesto {
  contenido?: ReactNode;
  reemplazaJugada?: boolean;
  ocultaDorsos?: boolean;
  mano?: ReactNode;
}

interface Props {
  base: string;
  asientos: readonly Puesto[];
  asientoInferior: number;
  dador: number;
  mano: number;
  muestra: CardId;
  titulo: string;
  numeroVuelta?: number;
  estado?: string;
  participantes?: readonly number[];
  turno?: number;
  vuelta?: (Vuelta & { resultado?: ResultadoVuelta }) | null;
  terminada?: boolean;
  nombrarJugadas?: boolean;
  manosOcultas?: { jugadas: readonly { asiento: number }[]; asientoVisible?: number };
  detalle?: (asiento: number, carta: CardId | undefined, ganadora: boolean) => DetallePuesto;
  pie?: PieEnTapete;
  zonaJugador?: ReactNode;
}

const posiciones: Readonly<Record<number, readonly string[]>> = {
  2: ["vos", "frente"],
  4: ["vos", "derecha", "frente", "izquierda"],
  6: ["vos", "cerca-derecha", "lejos-derecha", "frente", "lejos-izquierda", "cerca-izquierda"],
};

export function Naipe({ id, base, alt = nombrar(id) }: { id: CardId; base: string; alt?: string }) {
  return <img src={base + "img/cartas/tatu/" + id + ".webp"} width={384} height={596} alt={alt} />;
}

function Dorsos({ base, cantidad }: { base: string; cantidad: number }) {
  return <div className="j-dorsos" role="img" aria-label={cantidad === 1 ? "Una carta en mano" : cantidad + " cartas en mano"}>
    {Array.from({ length: cantidad }, (_, i) => (
      <img key={i} alt="" width={384} height={596} src={base + "img/cartas/tatu/reverso.webp"} />
    ))}
  </div>;
}

function MuestraConMazo({ carta, base }: { carta: CardId; base: string }) {
  const nombre = nombrar(carta);
  return <div className="j-muestra" role="img" aria-label={"Muestra " + nombre}>
    <div aria-hidden="true">
      <Naipe base={base} id={carta} />
      <img className="j-mazo" src={base + "img/cartas/tatu/reverso.webp"} alt="" width={384} height={596} />
    </div>
    <span className="j-rotulo-muestra" aria-hidden="true">
      <small>Muestra</small>
      <strong>{nombre}</strong>
    </span>
  </div>;
}

export function Tapete({
  base, asientos, asientoInferior, dador, mano, muestra, titulo, numeroVuelta, estado,
  participantes, turno, vuelta, terminada, nombrarJugadas, manosOcultas, detalle, zonaJugador, pie,
}: Props) {
  const receptor = pie?.vista.pie === asientoInferior ? pie : undefined;
  const globo = useGloboDelCompanero(receptor, muestra, a => asientos.find(p => p.asiento===a)?.nombre ?? "");
  const lugares = posiciones[asientos.length];
  const seis = lugares.length === 6;
  const resultado = vuelta?.resultado;
  const ganador = resultado?.tipo === "ganada" ? resultado.asiento : undefined;
  const veredicto = resultado?.tipo === "parda" ? "Parda" :
    ganador != null ? "Ganó " + asientos.find(a => a.asiento === ganador)?.nombre : undefined;

  const conZona = zonaJugador != null && typeof zonaJugador !== "boolean";
  const clase = ["j-tapete", nombrarJugadas && "j-tapete-con-rotulos", conZona && "j-tapete--jugador"]
    .filter(Boolean).join(" ");
  return <section className={clase} aria-label="Tapete">
    <header>
      <strong>{titulo}</strong>
      <div className="j-estado-vuelta">
        {terminada ? <span>Terminada</span> : numeroVuelta != null && <span>Vuelta {numeroVuelta}</span>}
        {estado && <span>{estado}</span>}
        {veredicto && <b>{veredicto}</b>}
      </div>
    </header>
    <div className={"j-puestos " + (seis ? "j-puestos-seis" : lugares.length === 2 ? "j-duelo" : "j-parejas") + (receptor ? " j-con-senas" : "")}
      role={seis ? "group" : undefined} aria-label={seis ? "Los seis asientos" : undefined}>
      {asientos.map(a => {
        const posicion = lugares[(a.asiento - asientoInferior + lugares.length) % lugares.length];
        const carta = vuelta?.jugadas.find(j => j.asiento === a.asiento)?.carta;
        const ganadora = ganador === a.asiento;
        const extra = detalle?.(a.asiento, carta, ganadora);
        const restantes = manosOcultas && !carta && !extra?.ocultaDorsos && a.asiento !== manosOcultas.asientoVisible
          ? 3 - manosOcultas.jugadas.filter(jugada => jugada.asiento === a.asiento).length
          : 0;
        return <div key={a.asiento} className={"j-puesto j-" + posicion} role="group"
          aria-label={a.etiqueta ?? a.nombre ?? undefined} data-activo={participantes?.includes(a.asiento)}
          data-turno={a.asiento === turno || undefined}>
          <div className="j-ocupante">
            <div className="j-persona">
              <b>{a.nombre}</b>
              <span>{[a.papel, a.asiento === pie?.vista.pie && "Pie de tu equipo", a.asiento === dador && "Dador", a.asiento === mano && "Mano"].filter(Boolean).join(" · ")}</span>
            </div>
            {extra?.contenido}
            {restantes > 0 && <Dorsos base={base} cantidad={restantes} />}
            {carta && !extra?.reemplazaJugada && <div className={ganadora ? "j-jugada j-ganadora" : "j-jugada"}>
              <Naipe base={base} id={carta} />
              {nombrarJugadas && <span className="j-nombre-jugada" aria-hidden="true">{nombrar(carta)}</span>}
              {ganadora && <small>Ganó la vuelta</small>}
            </div>}
          </div>
          {a.asiento === dador && <MuestraConMazo base={base} carta={muestra} />}
          {globo.boton(a.asiento)}
          {extra?.mano}
        </div>;
      })}
      {globo.contenido}
    </div>
    {conZona && <div className="j-zona-tapete">{zonaJugador}</div>}
  </section>;
}
