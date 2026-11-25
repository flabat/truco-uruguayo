import type { Asiento } from "@eltruco/motor/reparto.ts";
import { canto } from "@eltruco/cliente/cantos.ts";
import { cartasPorId } from "@eltruco/cliente/cartas.ts";
import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import {
  cartasPedidas, significadoDeGesto, textoDeIndicacion, versionSenasPie, type CartaPedida, type FrasePie, type GestoPie,
} from "@eltruco/motor/senas-pie.ts";
import { canSeeSignal, signals, signalVersionFor } from "../../../training/contracts/index.ts";
import juego from "../../../src/data/juego.json" with { type: "json" };

export type SenasEnMesa =
  | { tipo: "ninguna" }
  | {
      tipo: "pie"; vuelta: number;
      globos: { emisor: number; nombre: string; gestos: { gesto: GestoPie; significado: string }[] }[];
      frases: {
        destinatario: number; nombre: string; frases: FrasePie[]; esperando: boolean;
        /** «Jugá» con cada carta que el compañero le mostró al pie. */
        pedidas: { carta: CartaPedida; texto: string }[];
      }[];
    }
  | {
      tipo: "companero"; pie: number; texto: string; gestos: GestoPie[];
      /** Lo que el pie le pidió en esta vuelta, mientras no tiró: el texto y las cartas propias que nombró. */
      pedido?: { texto: string; cartas: CardId[] };
    }
  | { tipo: "silencio"; recibidas: { nombre: string; sena: string; jugada: string }[] };

// Los textos del menú son las filas de la tabla publicada, en el orden de `signals`.
const filas = juego.find(seccion => seccion.id === "senas")!.blocks
  .map(b => "table" in b ? b.table : undefined).find(tabla => tabla !== undefined)!.rows;
const textoDeSena = new Map(signals.map((id, i) => [id, filas[i][1].replace(/\.$/, "")]));

const significado = (gesto: GestoPie, muestra: CardId) => significadoDeGesto(gesto, muestra);

function versionDeSenas(mesa: Mesa) {
  const legada = mesa.formato && mesa.formato !== "triples" ? signalVersionFor(mesa.formato) : null;
  return { legada, vigente: mesa.versionSenas ?? legada };
}

/** La mesa trae señas legadas y la seña se elige a mano antes de jugar. */
export function jugarEnSilencio(mesa: Mesa, partida: Partida | PartidaTercetos): boolean {
  const { legada, vigente } = versionDeSenas(mesa);
  return legada !== null && vigente === legada && (partida.versionSenas ?? legada) === legada;
}

export function senasEnMesa({ mesa, partida, espectador }: {
  mesa: Mesa; partida: Partida | PartidaTercetos | null; espectador: boolean;
}): SenasEnMesa {
  const ninguna = { tipo: "ninguna" } as const;
  if (espectador || !partida) return ninguna;

  if (jugarEnSilencio(mesa, partida)) {
    const recibidas = ("turnos" in partida ? partida.turnos ?? [] : []).filter(t => t.signal && t.action.asiento !== mesa.miAsiento
      && canSeeSignal("pairs-private-senas", t.action.asiento, mesa.miAsiento as Asiento)).map(({ signal, action }) => ({
      nombre: mesa.asientos[action.asiento].nombre ?? "",
      sena: textoDeSena.get(signal!)!,
      jugada: action.tipo === "carta" ? cartasPorId.get(action.carta)!.nombre
        : action.tipo === "paso-flor" ? canto[action.tipo] : action.tipo.replaceAll("-", " "),
    }));
    return { tipo: "silencio", recibidas };
  }

  const { pie } = partida;
  if (mesa.modo === "1v1" || !pie) return ninguna;
  if (versionDeSenas(mesa).vigente !== versionSenasPie || partida.versionSenas !== versionSenasPie) return ninguna;
  if (partida.formato === "triples" && partida.lance.tipo === "pico-a-pico") return ninguna;
  const equipoPropio = mesa.asientos[mesa.miAsiento]?.equipo;
  if (mesa.asientos[pie.pie]?.equipo !== equipoPropio) return ninguna;

  const delEquipo = (asiento: number) => mesa.asientos[asiento]?.equipo === equipoPropio;
  const nombre = (asiento: number) => mesa.asientos[asiento]?.nombre ?? "";
  const muestra = partida.vista.muestra;
  if (pie.pie === mesa.miAsiento) {
    return {
      tipo: "pie",
      vuelta: pie.vuelta,
      globos: pie.grupos.filter(g => delEquipo(g.emisor)).map(({ emisor, gestos }) => ({
        emisor, nombre: nombre(emisor), gestos: gestos.map(gesto => ({ gesto, significado: significado(gesto, muestra) })),
      })),
      frases: pie.opciones.filter(o => delEquipo(o.destinatario)).map(({ destinatario, frases }) => ({
        destinatario, nombre: nombre(destinatario), frases, esperando: pie.esperando === destinatario,
        pedidas: !frases.includes("juga") ? [] : (pie.grupos.find(g => g.emisor === destinatario)?.gestos ?? [])
          .filter((g): g is CartaPedida => g !== "ojos-cerrados")
          .map(carta => ({ carta, texto: textoDeIndicacion({ frase: "juga", carta }, muestra) })),
      })),
    };
  }
  const grupo = pie.grupos.find(g => g.emisor === mesa.miAsiento);
  if (!grupo) return ninguna;
  const pedido = pedidoDelPie(partida, pie.pie, pie.vuelta, mesa.miAsiento, nombre);
  return {
    tipo: "companero",
    pie: pie.pie,
    texto: `Le mostraste a ${nombre(pie.pie)}: ${grupo.gestos.map(g => significado(g, muestra)).join(" · ")}`,
    gestos: grupo.gestos,
    ...(pedido && { pedido }),
  };
}

/**
 * La frase del pie para este asiento en la vuelta en curso, hasta que tire su carta. Si le pidió «Vení»
 * y otro compañero recibió la carta fuerte, también dice quién juega: el plan del equipo entero.
 */
function pedidoDelPie(partida: Partida | PartidaTercetos, pie: number, vuelta: number, propio: number,
    nombre: (asiento: number) => string): { texto: string; cartas: CardId[] } | undefined {
  const { vista } = partida;
  if (vista.vueltaActual?.jugadas.some(j => j.asiento === propio)) return undefined;
  const dichas = (partida.indicaciones ?? []).filter(i => i.emisor === pie && i.vuelta === vuelta);
  const propia = dichas.find(i => i.destinatario === propio);
  if (!propia) return undefined;
  const juega = propia.frase === "veni" ? dichas.find(i => i.frase !== "veni" && i.destinatario !== propio) : undefined;
  const texto = nombre(pie) + ": " + textoDeIndicacion(propia, vista.muestra)
    + (juega ? " · juega " + nombre(juega.destinatario) : "");
  const cartas = propia.carta && "cartas" in vista ? cartasPedidas(vista.cartas, propia.carta, vista.muestra) : [];
  return { texto, cartas };
}
