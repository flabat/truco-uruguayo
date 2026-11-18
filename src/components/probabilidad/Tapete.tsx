import { useId } from "react";
import type { VistaAsiento } from "../../motor/mano";
import { asientos, nombre, pareja } from "../mesa/relato";

export function Tapete({ mesa, enRepaso, base }: { mesa: VistaAsiento; enRepaso: boolean; base: string }) {
  const titulo = useId();
  const ultima = mesa.vueltas.at(-1);
  const entreVueltas = enRepaso && ultima && !mesa.vueltaActual?.jugadas.length;
  const vuelta = entreVueltas ? ultima : mesa.vueltaActual ?? ultima;
  const numero = mesa.vueltas.length + (vuelta === mesa.vueltaActual ? 1 : 0);
  const turno = mesa.turno === null ? pareja(mesa.equipoGanador!) + " ganó la mano"
    : mesa.turno === 0 ? "Te toca jugar" : "Turno de " + asientos[mesa.turno].toLowerCase();
  const jugadas = mesa.vueltas.flatMap(v => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
  const imagenes = base + "img/cartas/tatu/";
  return <section className="tapete" aria-labelledby={titulo}>
    <header className="tapete-cabecera"><h2 id={titulo}>Vuelta {numero}</h2><span className="prob-turno">{turno}</span></header>
    <div className="tapete-asientos">
      {asientos.map((etiqueta, i) => {
        const carta = vuelta?.jugadas.find(jugada => jugada.asiento === i)?.carta;
        const quedan = 3 - jugadas.filter(jugada => jugada.asiento === i).length;
        const activo = mesa.turno === i;
        return <div key={i} className={"asiento asiento-" + i + (activo ? " asiento-activo" : "")} role="group" aria-label={etiqueta}>
          <div><h3>{etiqueta}</h3><span className="asiento-papel">{mesa.mano === i ? "Mano" : mesa.dador === i ? "Dador" : ""}</span></div>
          <div className="asiento-cartas">
            {carta ? <div className="ap-carta"><img src={imagenes + carta + ".webp"} width="384" height="596" alt="" /><span>{nombre(carta)}</span></div>
              : i !== 0 && quedan > 0 ? <div className="abanico-mesa" role="img" aria-label={quedan === 1 ? "Una carta en mano" : quedan + " cartas en mano"}>
                {Array.from({ length: quedan }, (_, n) => <img key={n} src={imagenes + "reverso.webp"} width="384" height="596" alt="" />)}
              </div> : null}
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
