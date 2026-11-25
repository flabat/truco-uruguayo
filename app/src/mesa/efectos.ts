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

/**
 * Lo que debe sentirse y oírse con cada evento de la cola (tabla «Movimiento, hápticos y sonido»
 * del diseño). La vibración liviana al levantar una carta y la media al apoyarla las dispara
 * `ManoPropia`; acá la carta propia solo suena. Un espectador no tiene `paraMi` ni `nuestro`.
 */
export function efectosDe(e: Evento): Efectos {
  switch (e.tipo) {
    case "reparto":
      return { efecto: "roce" };
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
