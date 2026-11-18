import { useId, type Ref } from "react";
import type { CardId } from "../../motor/cartas";
import type { VistaAsiento } from "../../motor/mano";
import { asientos, nombre } from "../mesa/relato";

interface Props {
  mesa: VistaAsiento;
  enRepaso: boolean;
  base: string;
  seleccionada: CardId | null;
  seleccionar: (carta: CardId) => void;
  primeraCarta: Ref<HTMLButtonElement>;
}

export function Tapete({ mesa, enRepaso, base, seleccionada, seleccionar, primeraCarta }: Props) {
  const titulo = useId();
  const ultima = mesa.vueltas.at(-1);
  const entreVueltas = enRepaso && ultima && mesa.vueltaActual?.jugadas.length === 0;
  const vuelta = entreVueltas ? ultima : mesa.vueltaActual ?? ultima;
  const numero = mesa.vueltas.length + (vuelta === mesa.vueltaActual ? 1 : 0);
  const jugadas = mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  const imagenes = base + "img/cartas/tatu/";

  function naipe(carta: CardId) {
    return <><img src={imagenes + carta + ".webp"} width="384" height="596" alt="" /><span>{nombre(carta)}</span></>;
  }

  return <section className="tapete" aria-labelledby={titulo}>
    <header className="tapete-cabecera"><h2 id={titulo}>Vuelta {numero}{entreVueltas ? " · Terminada" : ""}</h2></header>
    <div className="tapete-asientos">
      {asientos.map((etiqueta, i) => {
        const carta = vuelta?.jugadas.find(jugada => jugada.asiento === i)?.carta;
        const quedan = 3 - jugadas.filter(jugada => jugada.asiento === i).length;
        const activo = mesa.turno === i;
        return <div key={i} className={"asiento asiento-" + i + (activo ? " asiento-activo" : "")} role="group" aria-label={etiqueta}>
          <div className="prob-asiento-nombre"><h3>{etiqueta}</h3><span className="asiento-papel">{mesa.mano === i ? "Mano" : mesa.dador === i ? "Dador" : ""}</span></div>
          <div className="asiento-cartas">
            {i === 0 && mesa.cartas.length > 0 && <div className="prob-mano" role="group" aria-label="Tus cartas en mano">
              {mesa.cartas.map((propia, n) => activo
                ? <button type="button" className="ap-carta" key={propia} ref={n === 0 ? primeraCarta : undefined}
                    aria-pressed={seleccionada === propia} onClick={() => seleccionar(propia)}>{naipe(propia)}</button>
                : <div className="ap-carta" key={propia}>{naipe(propia)}</div>)}
            </div>}
            {carta ? <div className="prob-jugada">
                {i === 0 && <small>Jugada</small>}
                <div className="ap-carta">{naipe(carta)}</div>
              </div>
              : i !== 0 && quedan > 0 && <div className="abanico-mesa" role="img" aria-label={quedan === 1 ? "Una carta en mano" : quedan + " cartas en mano"}>
                {Array.from({ length: quedan }, (_, n) => <img key={n} src={imagenes + "reverso.webp"} width="384" height="596" alt="" />)}
              </div>}
          </div>
        </div>;
      })}
      <div className="tapete-muestra prob-muestra" role="img" aria-label={"Muestra " + nombre(mesa.muestra)}>
        <div className="prob-mazo" aria-hidden="true">
          <div className="prob-dorso"><img src={imagenes + "reverso.webp"} width="384" height="596" alt="" /></div>
          <img className="prob-frente" src={imagenes + mesa.muestra + ".webp"} width="384" height="596" alt="" />
        </div>
        <small>Muestra</small><strong>{nombre(mesa.muestra)}</strong>
      </div>
    </div>
  </section>;
}
