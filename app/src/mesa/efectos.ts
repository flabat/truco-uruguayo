import { canto } from "@eltruco/cliente/cantos.ts";
import type { Efecto } from "../sonido/efectos.ts";
import type { CantoVoz, FraseVoz, MotivoTantos } from "../sonido/frases.ts";
import type { Evento } from "./cola.ts";

export type Vibracion = "liviano" | "medio" | "aviso" | "exito";

/** Un efecto de la parte 4e. La carta de otro jugador suena a la mitad. */
export interface EfectoSonoro {
  nombre: Efecto;
  volumen?: number;
}

export interface Efectos {
  vibracion?: Vibracion;
  efecto?: EfectoSonoro;
  voz?: { asiento: number; frase: FraseVoz };
}

// El texto de cada canto, tal como lo muestran los globos, de vuelta a su acción.
const cantoPorTexto = new Map<string, CantoVoz>(Object.entries(canto).map(([tipo, texto]) => [texto, tipo as CantoVoz]));
cantoPorTexto.set("Me voy al mazo", "mazo");

/**
 * La frase que dice la voz de un globo de canto: un canto («Truco», «Me voy al mazo») o la declaración
 * de tantos que hace el árbitro («33 de envido», «Son buenas»). Un texto que no es ninguna de las dos no suena.
 */
export function fraseDeCanto(texto: string): FraseVoz | null {
  const tantos = /^(\d+) de (envido|flor)$/.exec(texto);
  if (tantos) return { tipo: "tantos", motivo: tantos[2] as MotivoTantos, total: Number(tantos[1]) };
  if (texto === "Son buenas") return { tipo: "son-buenas" };
  const accion = cantoPorTexto.get(texto);
  return accion ? { tipo: "canto", canto: accion } : null;
}

/** A dónde van las vibraciones, los efectos y las voces; `useEfectos` pone los reales. */
export interface DestinoDeEfectos {
  vibrar(v: Vibracion): void;
  reproducirEfecto(nombre: Efecto, opciones?: { volumen?: number }): void;
  reproducirVoz(asiento: number, frase: FraseVoz): void;
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
  if (efecto) aislar(() => efecto.volumen == null
    ? destino.reproducirEfecto(efecto.nombre)
    : destino.reproducirEfecto(efecto.nombre, { volumen: efecto.volumen }));
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
      return {}; // un «reparto» por carta: lo programa `useReparto` con el plan
    case "carta":
      return { efecto: e.propia ? { nombre: "naipe" } : { nombre: "naipe", volumen: 0.5 } };
    case "canto": {
      const frase = fraseDeCanto(e.texto);
      const voz = frase ? { voz: { asiento: e.asiento, frase } } : {};
      // La declaración de tantos la hace el árbitro: suena, pero no pide respuesta.
      return e.paraMi && frase?.tipo !== "tantos" ? { vibracion: "aviso", ...voz } : voz;
    }
    case "frase":
      return e.paraMi ? { vibracion: "liviano", voz: { asiento: e.emisor, frase: { tipo: "pie", frase: e.pie } } } : {};
    case "vuelta":
      return e.nuestra ? { vibracion: "liviano" } : {};
    case "cobro":
      return e.nuestro ? { vibracion: "exito", efecto: { nombre: "ficha" } } : { efecto: { nombre: "ficha" } };
    case "chico":
      return e.nuestro ? { vibracion: "exito", efecto: { nombre: "festejo" } } : {};
  }
}
