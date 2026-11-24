import type { Format, PublicTurn } from "./contratos.ts";
import type { LanceTercetos, ResumenLance, VistaOnline, VistaTercetos } from "./mesa-online.ts";
import type { IndicacionPie, VistaPie } from "./senas-pie.ts";
import type { Asiento, Equipo } from "./reparto.ts";

type FaseRepartida = "en-juego" | "reparto-cerrado" | "chico-terminado";
interface Contexto<Fase extends FaseRepartida | "sin-repartir"> {
  versionVista: 1;
  fase: Fase;
}

interface Marcador {
  versionSenas?: string | null;
  pie?: VistaPie;
  indicaciones?: readonly IndicacionPie[];
  /** Sólo de presentación. Se fija al observar la apertura de esta vuelta en vivo. */
  llegadaEnVivo?: boolean;
  reconexion?: number;
  version: number;
  manoNumero: number;
  puntos: [number, number];
  meta: number;
  ganadorPartida: Equipo | null;
}

interface PartidaSinRepartir extends Marcador {
  formato?: Format | "triples";
  contexto: Contexto<"sin-repartir">;
  vista: null;
}

interface LanceSimple {
  tipo: "simple";
  duelo: null;
  activos: readonly Asiento[];
}

export interface Partida extends Marcador {
  formato?: Format;
  turnos?: readonly PublicTurn[];
  contexto: Contexto<FaseRepartida>;
  lance: LanceSimple;
  vista: VistaOnline;
}

export interface PartidaTercetos extends Marcador {
  formato: "triples";
  contexto: Contexto<FaseRepartida>;
  lance: LanceTercetos;
  historialLances: readonly ResumenLance[];
  vista: VistaTercetos;
}

export type PartidaJugador = PartidaSinRepartir | Partida | PartidaTercetos;
type Opcionales<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type SinRepartirRecibida = Opcionales<PartidaSinRepartir, "contexto">;
type SimpleRecibida = Opcionales<Partida, "contexto" | "lance">;
type TercetosRecibida = Opcionales<PartidaTercetos, "contexto">;
export type RespuestaPartida = SinRepartirRecibida | SimpleRecibida | TercetosRecibida;

/** También lee recibos anteriores usando exclusivamente la proyección del asiento en esa versión. */
export function normalizarPartida(partida: SinRepartirRecibida): PartidaSinRepartir;
export function normalizarPartida(partida: SimpleRecibida): Partida;
export function normalizarPartida(partida: TercetosRecibida): PartidaTercetos;
export function normalizarPartida(partida: RespuestaPartida): PartidaJugador;
export function normalizarPartida(partida: RespuestaPartida): PartidaJugador {
  if (partida.vista === null) {
    return { ...partida, contexto: partida.contexto ?? { versionVista: 1, fase: "sin-repartir" } };
  }
  const contexto: Contexto<FaseRepartida> = partida.contexto ?? {
    versionVista: 1,
    fase: partida.ganadorPartida != null ? "chico-terminado" : partida.vista.resultado ? "reparto-cerrado" : "en-juego",
  };
  if (partida.formato === "triples") return { ...partida, contexto };
  const lance: LanceSimple = partida.lance ?? {
    tipo: "simple", duelo: null, activos: partida.vista.equipoPorAsiento.map((_, i) => i as Asiento),
  };
  return { ...partida, contexto, lance };
}
