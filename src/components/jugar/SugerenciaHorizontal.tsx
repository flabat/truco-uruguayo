import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import "./sugerencia-horizontal.css";

const consulta = "(orientation: portrait) and (max-width: 600px) and (any-pointer: coarse)";
const clave = "truco.sugerencia-horizontal.v1";
let vistaEnEstaPagina = false;

function registrarPrimeraExposicion() {
  if (vistaEnEstaPagina) return false;
  vistaEnEstaPagina = true;
  try {
    if (window.sessionStorage.getItem(clave) !== null) return false;
    window.sessionStorage.setItem(clave, "1");
  } catch {
    // La memoria de esta página conserva la exposición si el navegador restringe el almacenamiento.
  }
  return true;
}

export function SugerenciaHorizontal({ encabezado }: { encabezado: RefObject<HTMLHeadingElement | null> }) {
  const [visible, mostrar] = useState(false);
  const aviso = useRef<HTMLDivElement>(null);
  const retirar = useCallback(() => {
    if (aviso.current?.contains(document.activeElement)) encabezado.current?.focus();
    mostrar(false);
  }, [encabezado]);

  useEffect(() => {
    const condicion = window.matchMedia(consulta);
    function actualizar() {
      if (!condicion.matches) retirar();
      else if (registrarPrimeraExposicion()) mostrar(true);
    }
    actualizar();
    condicion.addEventListener("change", actualizar);
    return () => condicion.removeEventListener("change", actualizar);
  }, [retirar]);

  if (!visible) return null;
  return (
    <div className="j-sugerencia-horizontal" role="note" ref={aviso}>
      <p>Girás el celular y ves mejor toda la mesa.</p>
      <button className="j-sec" type="button" onClick={retirar}>Ahora no</button>
    </div>
  );
}
