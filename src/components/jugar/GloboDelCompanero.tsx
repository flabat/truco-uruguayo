import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CardId } from "../../motor/cartas";
import { catalogoGestosPie, textoFrasePie, type FrasePie, type GestoPie, type VistaPie } from "../../motor/senas-pie";
import { CaraSena } from "./CaraSena";
import "./senas-pie.css";

export type ElegirIndicacion = (destinatario: number, frase: FrasePie | "sin-indicacion", vuelta: number) => void;
type Nombre = (asiento: number) => string;

export interface PieEnTapete {
  vista: VistaPie;
  mano: number;
}

function significado(gesto: GestoPie, muestra: CardId) {
  return catalogoGestosPie[gesto].significado.replace("de la muestra", "de " + muestra.split("-")[0]);
}

const ayudaFrase = {
  veni: "Jugá una baja. El pie puede cubrir la vuelta.",
  juga: "Salí con algo. El pie te pide una carta fuerte.",
  "voy-a-vos": "El pie juega antes que vos y te pide una carta fuerte.",
} satisfies Record<FrasePie, string>;

export function esperaDelCompanero(pie: VistaPie | undefined, nombre: Nombre) {
  if (pie?.esperando == null) return undefined;
  return {
    titulo: nombre(pie.esperando) + " espera tu indicación",
    indicacion: "Hablale en voz alta o dejá que elija su carta en silencio.",
  };
}

export function AccionesDelPie({ pie, nombre, bloqueada, elegir }: {
  pie: VistaPie; nombre: Nombre; bloqueada: boolean; elegir: ElegirIndicacion;
}) {
  if (!pie.opciones.length) return null;
  return <div className="j-indicaciones-pie">
    {pie.opciones.map(({ destinatario, frases }) => <fieldset key={destinatario} disabled={bloqueada}>
      <legend>{pie.esperando === destinatario ? "Para " + nombre(destinatario) : "Decirle a " + nombre(destinatario) + " en voz alta"}</legend>
      <div className="j-cantos">
        {frases.map(frase => <button type="button" className="j-sec" key={frase}
          title={ayudaFrase[frase]} aria-description={ayudaFrase[frase]}
          onClick={() => elegir(destinatario, frase, pie.vuelta)}>
          {textoFrasePie[frase]}
        </button>)}
        {pie.esperando === destinatario && <button type="button" className="j-sec"
          onClick={() => elegir(destinatario, "sin-indicacion", pie.vuelta)}>Dejar jugar</button>}
      </div>
    </fieldset>)}
  </div>;
}

function Gestos({ gestos, emisor, muestra }: { gestos: readonly GestoPie[]; emisor: string; muestra: CardId }) {
  return <ul className="j-gestos" aria-live="polite" aria-atomic="true">
    {gestos.map(gesto => <li key={gesto}
      aria-label={`${emisor} · ${catalogoGestosPie[gesto].expresion} · ${significado(gesto, muestra)}`}>
      <CaraSena gesto={gesto}/>
    </li>)}
  </ul>;
}

export function SenasEnviadas({ pie, muestra, nombre }: { pie: VistaPie; muestra: CardId; nombre: Nombre }) {
  const propias = pie.grupos[0];
  if (!propias) return null;
  return <details className="j-senas-enviadas">
    <summary>Tus señas a {nombre(pie.pie)} · {propias.gestos.length}</summary>
    <Gestos gestos={propias.gestos} emisor={nombre(propias.emisor)} muestra={muestra}/>
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
  return {
    mano: datos?.mano, vuelta: datos?.vista.vuelta, abierto: datos?.vista.grupos[0]?.emisor ?? null,
  };
}

// Al empezar la vuelta, el pie ve al primer compañero en el orden de juego.
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
    cambiar(e => ({ ...e, abierto: null }));
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
      onClick={() => cambiar(e => ({ ...e, abierto: abierto ? null : senas.emisor }))}>
      <Candado/> Señas <span>{senas.gestos.length}</span>
    </button>;
  }
  const contenido = grupo && <div className="j-franja-globo" ref={franja}>
    <section id={id} className="j-globo-senas" aria-label={"Señas privadas de " + nombre(grupo.emisor)}>
      <Gestos gestos={grupo.gestos} emisor={nombre(grupo.emisor)} muestra={muestra}/>
      <button type="button" className="j-cerrar-globo" aria-label="Cerrar señas" onClick={cerrar}>×</button>
    </section>
  </div>;
  return { boton, contenido };
}
