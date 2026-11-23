import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CardId } from "../../motor/cartas";
import { catalogoGestosPie, textoFrasePie, type FrasePie, type GestoPie, type VistaPie } from "../../motor/senas-pie";
import { CaraSena } from "./CaraSena";
import "./senas-pie.css";

export type DecirAlCompanero = (destinatario: number, frase: FrasePie, vuelta: number) => void;
type Nombre = (asiento: number) => string;

export interface PieEnTapete {
  vista: VistaPie;
  mano: number;
  llegadaEnVivo: boolean;
}

function significado(gesto: GestoPie, muestra: CardId) {
  return catalogoGestosPie[gesto].significado.replace("de la muestra", "de " + muestra.split("-")[0]);
}

export function AccionesDelPie({ pie, nombre, bloqueada, decir }: {
  pie: VistaPie; nombre: Nombre; bloqueada: boolean; decir: DecirAlCompanero;
}) {
  if (!pie.opciones.length) return null;
  return <div className="j-indicaciones-pie">
    {pie.opciones.map(({ destinatario, frases }) => <fieldset key={destinatario} disabled={bloqueada}>
      <legend>Decirle a {nombre(destinatario)} en voz alta</legend>
      <div className="j-cantos">
        {frases.map(frase => <button type="button" className="j-sec" key={frase}
          onClick={() => decir(destinatario, frase, pie.vuelta)}>
          {textoFrasePie[frase]}
        </button>)}
      </div>
    </fieldset>)}
  </div>;
}

export function SenasEnviadas({ pie, muestra, nombre }: { pie: VistaPie; muestra: CardId; nombre: Nombre }) {
  const propias = pie.grupos[0];
  if (!propias) return null;
  return <details className="j-senas-enviadas">
    <summary>Tus señas a {nombre(pie.pie)} · {propias.gestos.length}</summary>
    <p>Al abrir la vuelta · {propias.gestos.map(g => significado(g, muestra)).join(" · ")}</p>
  </details>;
}

function Candado() {
  return <svg viewBox="0 0 16 18" width="13" height="15" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.6">
    <rect x="2" y="8" width="12" height="8" rx="2"/>
    <path d="M4.7 8V5a3.3 3.3 0 016.6 0v3"/>
  </svg>;
}

function alAbrir(datos?: PieEnTapete) {
  const abierto = datos?.vista.grupos[0]?.emisor ?? null;
  return {
    mano: datos?.mano, vuelta: datos?.vista.vuelta, abierto,
    vistos: new Set<number>(abierto === null ? [] : [abierto]),
    animar: Boolean(datos?.llegadaEnVivo),
  };
}

// La selección y la reproducción son locales a esta vista y esta vuelta.
export function useGloboDelCompanero(datos: PieEnTapete | undefined, muestra: CardId, nombre: Nombre) {
  const id = useId();
  const franja = useRef<HTMLDivElement>(null);
  const anclas = useRef(new Map<number, HTMLButtonElement>());
  const [estado, cambiar] = useState(() => alAbrir(datos));
  if (estado.mano !== datos?.mano || estado.vuelta !== datos?.vista.vuelta) cambiar(alAbrir(datos));

  const grupo = datos?.vista.grupos.find(g => g.emisor === estado.abierto);
  const emisor = grupo?.emisor;

  function cerrar() {
    if (emisor !== undefined) anclas.current.get(emisor)?.focus();
    cambiar(e => ({ ...e, abierto: null, animar: false }));
  }
  useEffect(() => {
    if (emisor === undefined) return;
    function escapar(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        cerrar();
      }
    }
    document.addEventListener("keydown", escapar);
    return () => document.removeEventListener("keydown", escapar);
  }, [emisor]);

  useLayoutEffect(() => {
    if (emisor === undefined) return;
    const banda = franja.current;
    const globo = banda?.firstElementChild;
    const boton = anclas.current.get(emisor);
    if (!banda || !(globo instanceof HTMLElement) || !boton) return;

    const ubicar = () => {
      const base = banda.getBoundingClientRect();
      const ancla = boton.getBoundingClientRect();
      const ancho = globo.getBoundingClientRect().width;
      const centro = ancla.left + ancla.width / 2 - base.left;
      const izquierda = Math.max(0, Math.min(centro - ancho / 2, base.width - ancho));
      globo.style.marginInlineStart = izquierda + "px";
      globo.style.setProperty("--punta", Math.max(12, Math.min(centro - izquierda, ancho - 12)) + "px");
    };
    ubicar();
    const observer = new ResizeObserver(ubicar);
    for (const el of [banda, globo, boton]) observer.observe(el);
    return () => observer.disconnect();
  }, [emisor, estado.mano, estado.vuelta]);

  function boton(asiento: number) {
    const senas = datos?.vista.grupos.find(g => g.emisor === asiento);
    if (!senas) return null;
    const abierto = emisor === asiento;
    return <button type="button" className="j-boton-senas" aria-expanded={abierto} aria-controls={abierto ? id : undefined}
      aria-label={`Señas de ${nombre(asiento)} (${senas.gestos.length})`}
      ref={el => {
        if (el) anclas.current.set(asiento, el);
        else anclas.current.delete(asiento);
      }}
      onClick={() => cambiar(e => ({
        ...e, abierto: abierto ? null : senas.emisor, vistos: new Set([...e.vistos, asiento]),
        animar: !e.vistos.has(asiento) && Boolean(datos?.llegadaEnVivo),
      }))}>
      <Candado/> Señas <span>{senas.gestos.length}</span>
    </button>;
  }
  const contenido = grupo && <div className="j-franja-globo" ref={franja}>
    <section id={id} className="j-globo-senas" aria-label={"Señas privadas de " + nombre(grupo.emisor)}>
      <div className="j-globo-cabecera">
        <Candado/>
        <div><b>Privadas · {nombre(grupo.emisor)}</b><small>Al abrir la vuelta</small></div>
        <button type="button" className="j-cerrar-globo" aria-label="Cerrar señas" onClick={cerrar}>×</button>
      </div>
      <ul key={estado.mano + "." + estado.vuelta + "." + grupo.emisor} aria-live="polite" aria-atomic="true">
        {grupo.gestos.map(gesto => <li key={gesto}
          aria-label={`${nombre(grupo.emisor)} · ${catalogoGestosPie[gesto].expresion} · ${significado(gesto, muestra)}`}>
          <CaraSena gesto={gesto} animar={estado.animar && Boolean(datos?.llegadaEnVivo)}/>
          <span>{significado(gesto, muestra)}</span>
        </li>)}
      </ul>
    </section>
  </div>;
  return { boton, contenido };
}
