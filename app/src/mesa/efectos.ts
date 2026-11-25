import type { Evento } from "./cola.ts";

export type Vibracion = "liviano" | "medio" | "aviso" | "exito";
export type NombreEfecto = "roce" | "naipe" | "naipe-bajo" | "ficha" | "festejo";

export interface Efectos {
  vibracion?: Vibracion;
  efecto?: NombreEfecto;
  voz?: { asiento: number; frase: string };
}

// «33 de envido»: la declaración de tantos que hace el árbitro. Un canto lleva solo letras.
const esDeclaracionDeTantos = (texto: string) => /^\d+ de /.test(texto);

/** A dónde van las vibraciones, los efectos y las voces; `useEfectos` pone los reales. */
export interface DestinoDeEfectos {
  vibrar(v: Vibracion): void;
  reproducirEfecto(nombre: NombreEfecto): void;
  reproducirVoz(asiento: number, frase: string): void;
}

/** Despacha lo de `efectosDe`: solo vibra con los hápticos encendidos y aísla cada falla. */
export function despacharEfectos(e: Evento, hapticos: boolean, destino: DestinoDeEfectos) {
  const { vibracion, efecto, voz } = efectosDe(e);
  const aislar = (hacer: () => void) => {
    try {
      hacer();
    } catch (error) {
      console.warn("Falló un efecto de la mesa", error);
    }
  };
  if (hapticos && vibracion) aislar(() => destino.vibrar(vibracion));
  if (efecto) aislar(() => destino.reproducirEfecto(efecto));
  if (voz) aislar(() => destino.reproducirVoz(voz.asiento, voz.frase));
}

/**
 * Lo que debe sentirse y oírse con cada evento de la cola (tabla «Movimiento, hápticos y sonido»
 * del diseño). La vibración liviana al levantar una carta y la media al apoyarla las dispara
 * `ManoPropia`; acá la carta propia solo suena. Un espectador no tiene `paraMi` ni `nuestro`.
 */
export function efectosDe(e: Evento): Efectos {
  switch (e.tipo) {
    case "reparto":
      return {}; // un roce por carta: lo programa `useReparto` con el plan
    case "carta":
      return { efecto: e.propia ? "naipe" : "naipe-bajo" };
    case "canto": {
      const voz = { asiento: e.asiento, frase: e.texto };
      if (esDeclaracionDeTantos(e.texto)) return { voz };
      return e.paraMi ? { vibracion: "aviso", voz } : { voz };
    }
    case "frase":
      return e.paraMi ? { vibracion: "liviano", voz: { asiento: e.emisor, frase: e.texto } } : {};
    case "vuelta":
      return e.nuestra ? { vibracion: "liviano" } : {};
    case "cobro":
      return e.nuestro ? { vibracion: "exito", efecto: "ficha" } : { efecto: "ficha" };
    case "chico":
      return e.nuestro ? { vibracion: "exito", efecto: "festejo" } : {};
  }
}
