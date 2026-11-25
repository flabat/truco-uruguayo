import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { canto } from "@eltruco/cliente/cantos.ts";
import { entreCartas, vueltaCompleta, type Paso, type PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { vozDeIndicacion, type Nombre } from "@eltruco/cliente/textos.ts";
import { vocesEnAccion, type Voz } from "@eltruco/cliente/voces.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { textoFrasePie } from "@eltruco/motor/senas-pie.ts";

export const entreCartasLiviano = 250;
export const vueltaCompletaLiviana = 1200;

type Versionada = { version: number; manoNumero: number; indicaciones?: readonly unknown[] } | undefined;

export interface Cola<T> {
  recibida: T;
  reconexion: number;
  pasos: Paso<T>[];
  /** El paso con `antesDelResultado` cuyo naipe ya está en el paño: muestra su `partida`. */
  cargado: Paso<T> | null;
}

export function colaInicial<T extends Versionada>(actual: T, presencio: boolean, reconexion: number,
    pasosNuevos: PasosNuevos<T>): Cola<T> {
  return { recibida: actual, reconexion, pasos: pasosNuevos(undefined, actual, presencio), cargado: null };
}

/** Devuelve la misma cola si no llegó nada nuevo, así el gancho puede compararla por identidad. */
export function recibir<T extends Versionada>(c: Cola<T>, actual: T, presencio: boolean, reconexion: number,
    pasosNuevos: PasosNuevos<T>): Cola<T> {
  if (reconexion !== c.reconexion) return { recibida: actual, reconexion, pasos: [], cargado: null };
  if (actual?.version === c.recibida?.version && actual?.manoNumero === c.recibida?.manoNumero
      && actual?.indicaciones?.length === c.recibida?.indicaciones?.length) return c;
  const pasos = pasosNuevos(c.recibida, actual, presencio, c.pasos);
  return { recibida: actual, reconexion, pasos, cargado: pasos[0] === c.cargado ? c.cargado : null };
}

export function avanzar<T>(c: Cola<T>): Cola<T> {
  const paso = c.pasos[0];
  if (!paso) return c;
  if (paso.antesDelResultado && c.cargado !== paso) return { ...c, cargado: paso };
  return { ...c, pasos: c.pasos.slice(1), cargado: null };
}

export function enPantalla<T>(c: Cola<T>): { partida: T; presentando: boolean; voz?: Voz } {
  const paso = c.pasos[0];
  const presentando = Boolean(paso && (paso.partida !== c.recibida || paso.antesDelResultado));
  const pantalla = paso?.antesDelResultado && paso !== c.cargado ? paso.antesDelResultado : paso?.partida;
  return { partida: presentando && pantalla !== undefined ? pantalla : c.recibida, presentando, voz: paso?.voz };
}

export function duracion(paso: Paso<unknown>, liviano: boolean): number {
  if (!liviano) return paso.espera;
  if (paso.espera === entreCartas) return entreCartasLiviano;
  if (paso.espera === vueltaCompleta) return vueltaCompletaLiviana;
  return paso.espera;
}

export type Evento =
  | { tipo: "reparto"; dador: number }
  | { tipo: "carta"; asiento: number; carta: CardId; propia: boolean }
  | { tipo: "canto"; asiento: number; texto: string; paraMi: boolean }
  | { tipo: "frase"; emisor: number; destinatario: number; texto: string; paraMi: boolean }
  | { tipo: "vuelta"; ganador: number | null; nuestra: boolean }
  | { tipo: "cobro"; equipo: number; tantos: number; nuestro: boolean }
  | { tipo: "chico"; nuestro: boolean };

type Mostrada = Partida | PartidaTercetos;

// Solo estos cantos esperan una respuesta de quien los recibe.
const piden = ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido",
  "flor", "con-flor-envido", "contraflor-al-resto"] as const;
const pidenRespuesta = new Set<string>(piden.map(t => canto[t]));

function equipoDe(p: Mostrada, asiento: number | null): number | null {
  return asiento == null ? null : p.vista.equipoPorAsiento[asiento] ?? null;
}

export function cantoDeVoz(partida: Mostrada, voz: Voz, miAsiento: number | null): Evento {
  const mio = equipoDe(partida, miAsiento);
  const paraMi = mio != null && voz.indice === 0 && pidenRespuesta.has(voz.texto)
    && equipoDe(partida, voz.asiento) !== mio;
  return { tipo: "canto", asiento: voz.asiento, texto: voz.texto, paraMi };
}

function igual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compara dos estados mostrados. Si las acciones de antes no son el comienzo de las de
 * después, empezó otra mano o lance y todo lo de después es nuevo.
 */
export function eventosEntre(antes: Mostrada | undefined, despues: Mostrada, miAsiento: number | null,
    nombre?: Nombre): Evento[] {
  if (!antes) return [];
  const eventos: Evento[] = [];
  const mio = equipoDe(despues, miAsiento);
  const vista = despues.vista;
  const otraMano = antes.manoNumero !== despues.manoNumero;
  if (otraMano) eventos.push({ tipo: "reparto", dador: vista.dador });

  const previas = antes.vista.acciones;
  const mismoLance = !otraMano && previas.length <= vista.acciones.length
    && previas.every((a, i) => igual(a, vista.acciones[i]));
  const base = mismoLance ? antes.vista : { acciones: [], vueltas: [], cobros: [] };

  for (let i = base.acciones.length; i < vista.acciones.length; i++) {
    const accion = vista.acciones[i];
    if (accion.tipo === "carta") {
      eventos.push({ tipo: "carta", asiento: accion.asiento, carta: accion.carta,
        propia: miAsiento != null && accion.asiento === miAsiento });
    } else {
      for (const voz of vocesEnAccion(vista, i)) eventos.push(cantoDeVoz(despues, voz, miAsiento));
    }
  }

  const dichas = otraMano ? 0 : antes.indicaciones?.length ?? 0;
  for (const d of despues.indicaciones?.slice(dichas) ?? []) {
    eventos.push({ tipo: "frase", emisor: d.emisor, destinatario: d.destinatario,
      texto: nombre ? vozDeIndicacion(d, nombre) : textoFrasePie[d.frase],
      paraMi: miAsiento != null && d.destinatario === miAsiento });
  }

  for (const v of vista.vueltas.slice(base.vueltas.length)) {
    const ganada = v.resultado.tipo === "ganada" ? v.resultado : null;
    eventos.push({ tipo: "vuelta", ganador: ganada?.asiento ?? null, nuestra: mio != null && ganada?.equipo === mio });
  }

  // Un cobro puede cambiar de lugar entre dos pasos (el del truco se suma al final de la mano).
  const yaCobrados = [...base.cobros];
  for (const c of vista.cobros) {
    const visto = yaCobrados.findIndex(y => y.motivo === c.motivo && y.equipo === c.equipo && y.tantos === c.tantos);
    if (visto >= 0) {
      yaCobrados.splice(visto, 1);
      continue;
    }
    eventos.push({ tipo: "cobro", equipo: c.equipo, tantos: c.tantos, nuestro: mio != null && c.equipo === mio });
  }

  if (antes.ganadorPartida == null && despues.ganadorPartida != null) {
    eventos.push({ tipo: "chico", nuestro: mio != null && despues.ganadorPartida === mio });
  }
  return eventos;
}
