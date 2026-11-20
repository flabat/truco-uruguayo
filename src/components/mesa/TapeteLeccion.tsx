import type { ReactNode, Ref } from "react";
import type { CardId } from "../../motor/cartas";
import type { VistaAsiento } from "../../motor/mano";
import { nombrar } from "../jugar/HistorialDeMano";
import { Dorsos, Naipe, Tapete } from "../jugar/Tapete";
import { asientos, nombre } from "./relato";

const puestos = asientos.map((nombre, asiento) => ({ nombre, asiento }));
const turnos = ["Tu turno", "Turno del rival de la derecha", "Turno de tu compañero", "Turno del rival de la izquierda"];
const salidas = ["Sos mano", "Sale el rival de la derecha", "Sale tu compañero", "Sale el rival de la izquierda"];

interface Props {
  base: string;
  mesa: VistaAsiento;
  cartas: ReactNode;
  etiquetaCartas: string;
  enReparto?: boolean;
  finDeVuelta?: boolean;
  anuncio?: string;
}

export function TapeteLeccion({ base, mesa, cartas, etiquetaCartas, enReparto, finDeVuelta, anuncio }: Props) {
  const anterior = mesa.vueltas.at(-1);
  // El repaso deja a la vista la última vuelta completa antes de mostrar la salida siguiente.
  const vuelta = finDeVuelta && !mesa.vueltaActual?.jugadas.length ? anterior : mesa.vueltaActual ?? anterior;
  const cerrada = vuelta === anterior && !!anterior;
  const jugadas = mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  const turno = !cerrada && !anuncio && !enReparto ? mesa.turno ?? undefined : undefined;
  const estado = anuncio ?? (enReparto ? salidas[mesa.mano] : turno != null ? turnos[turno] : undefined);
  const numero = mesa.vueltas.length + (cerrada ? 0 : 1);
  return <Tapete base={base} asientos={puestos} asientoInferior={mesa.asiento}
    dador={mesa.dador} mano={mesa.mano} muestra={mesa.muestra} titulo={enReparto ? "El reparto" : "Mesa de parejas"}
    numeroVuelta={enReparto ? undefined : numero} estado={estado} vuelta={vuelta} turno={turno} nombrarJugadas
    detalle={(asiento, carta) => {
      const cantidad = 3 - jugadas.filter(j => j.asiento === asiento).length;
      return {
        contenido: asiento !== mesa.asiento && !carta && cantidad > 0 && <Dorsos base={base} cantidad={cantidad} />,
        mano: asiento === mesa.asiento && <div className="mesa-naipes" role="group" aria-label={etiquetaCartas}>{cartas}</div>,
      };
    }}
  />;
}

interface PropsCarta {
  base: string;
  carta: CardId;
  elegir?: () => void;
  seleccionada?: boolean;
  marcada?: boolean;
  jugar?: boolean;
  referencia?: Ref<HTMLButtonElement>;
}

export function CartaEnLeccion({ base, carta, elegir, seleccionada, marcada, jugar, referencia }: PropsCarta) {
  const figura = <><Naipe id={carta} base={base} alt="" /><span>{nombrar(carta)}</span></>;
  return elegir
    ? <button className="ap-carta" type="button" onClick={elegir} ref={referencia}
        aria-pressed={seleccionada} aria-label={jugar ? "Jugar " + nombre(carta) : undefined}>{figura}</button>
    : <div className={marcada ? "ap-carta ap-elegida" : "ap-carta"}>{figura}</div>;
}
