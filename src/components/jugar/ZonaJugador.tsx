import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import "./zona-jugador.css";

type Props = {
  titulo: string;
  detalle?: ReactNode;
  bloqueada: boolean;
  sena?: ReactNode;
  mano: ReactNode;
  cantos?: ReactNode;
  continuacion?: ReactNode;
};

export function ZonaJugador({ titulo, detalle, bloqueada, sena, mano, cantos, continuacion }: Props) {
  const encabezado = useRef<HTMLHeadingElement>(null);
  const botonActivado = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const cancelarRecuperacion = () => { botonActivado.current = null; };
    document.addEventListener("pointerdown", cancelarRecuperacion, true);
    return () => document.removeEventListener("pointerdown", cancelarRecuperacion, true);
  }, []);

  useLayoutEffect(() => {
    const boton = botonActivado.current;
    if (!boton) return;
    const foco = document.activeElement;
    if (foco !== boton && foco !== document.body) {
      botonActivado.current = null;
    } else if (!boton.isConnected || boton.matches(":disabled")) {
      botonActivado.current = null;
      encabezado.current?.focus();
    }
  });

  return <section className="j-zona-jugador" aria-label="Zona de juego" data-bloqueada={bloqueada || undefined}
    onClickCapture={e => {
      const boton = e.target instanceof Element ? e.target.closest("button") : null;
      botonActivado.current = e.detail === 0 && boton === document.activeElement ? boton : null;
    }}
    onBlurCapture={e => {
      if (e.relatedTarget && e.relatedTarget !== document.body) botonActivado.current = null;
    }}>
    <div className="j-zona-estado">
      <h2 ref={encabezado} tabIndex={-1}>{titulo}</h2>
      <div role="status" aria-atomic="true">
        <span className="j-zona-anuncio">{titulo}. </span>
        {detalle}
      </div>
    </div>
    {sena && <div className="j-zona-sena">{sena}</div>}
    {mano && <div className="j-zona-mano">{mano}</div>}
    {(cantos || continuacion) && <div className="j-zona-cantos">{cantos}{continuacion}</div>}
  </section>;
}
