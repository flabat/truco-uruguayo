import { canto } from "@eltruco/cliente/cantos.ts";
import { cartasPorId } from "@eltruco/cliente/cartas.ts";
import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { signals } from "@eltruco/motor/contratos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { catalogoGestosPie, versionSenasPie, type FrasePie, type GestoPie } from "@eltruco/motor/senas-pie.ts";
import { signalVersionFor } from "../../../training/contracts/index.ts";
import juego from "../../../src/data/juego.json" with { type: "json" };

export type SenasEnMesa =
  | { tipo: "ninguna" }
  | {
      tipo: "pie"; vuelta: number;
      globos: { emisor: number; nombre: string; gestos: { gesto: GestoPie; significado: string }[] }[];
      frases: { destinatario: number; nombre: string; frases: FrasePie[]; esperando: boolean }[];
    }
  | { tipo: "companero"; pie: number; texto: string; gestos: GestoPie[] }
  | { tipo: "silencio"; recibidas: { nombre: string; sena: string; jugada: string }[] };

// Los textos del menú son las filas de la tabla publicada, en el orden de `signals`.
const filas = juego.find(seccion => seccion.id === "senas")!.blocks
  .map(b => "table" in b ? b.table : undefined).find(tabla => tabla !== undefined)!.rows;
const textoDeSena = new Map(signals.map((id, i) => [id, filas[i][1].replace(/\.$/, "")]));

function significado(gesto: GestoPie, muestra: CardId) {
  return catalogoGestosPie[gesto].significado.replace("de la muestra", "de " + muestra.split("-")[0]);
}

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
    const recibidas = ("turnos" in partida ? partida.turnos ?? [] : []).filter(t => t.signal).map(({ signal, action }) => ({
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

  const nombre = (asiento: number) => mesa.asientos[asiento]?.nombre ?? "";
  const muestra = partida.vista.muestra;
  if (pie.pie === mesa.miAsiento) {
    return {
      tipo: "pie",
      vuelta: pie.vuelta,
      globos: pie.grupos.map(({ emisor, gestos }) => ({
        emisor, nombre: nombre(emisor), gestos: gestos.map(gesto => ({ gesto, significado: significado(gesto, muestra) })),
      })),
      frases: pie.opciones.map(({ destinatario, frases }) => ({
        destinatario, nombre: nombre(destinatario), frases, esperando: pie.esperando === destinatario,
      })),
    };
  }
  const grupo = pie.grupos[0];
  if (!grupo) return ninguna;
  return {
    tipo: "companero",
    pie: pie.pie,
    texto: `Le mostraste a ${nombre(pie.pie)}: ${grupo.gestos.map(g => significado(g, muestra)).join(" · ")}`,
    gestos: grupo.gestos,
  };
}
