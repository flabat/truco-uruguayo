import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { canto } from "@eltruco/cliente/cantos.ts";
import { entreCartas, vueltaCompleta, type Paso, type PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { vozDeIndicacion, type Nombre } from "@eltruco/cliente/textos.ts";
import { vocesEnAccion, type Voz } from "@eltruco/cliente/voces.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { textoFrasePie, type FrasePie } from "@eltruco/motor/senas-pie.ts";
import { duracionDelReparto } from "./movimiento.ts";

export const entreCartasLiviano = 250;
export const vueltaCompletaLiviana = 1200;

export type Versionada = { version: number; manoNumero: number; indicaciones?: readonly unknown[] } | undefined;

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

/**
 * Devuelve la misma cola si no llegó nada nuevo, así el gancho puede compararla por identidad.
 * Una lectura nueva de la misma versión (por ejemplo, otro `pie`) reemplaza a la recibida
 * también en los pasos que la mostraban al día.
 */
export function recibir<T extends Versionada>(c: Cola<T>, actual: T, presencio: boolean, reconexion: number,
    pasosNuevos: PasosNuevos<T>): Cola<T> {
  if (reconexion !== c.reconexion) return { recibida: actual, reconexion, pasos: [], cargado: null };
  if (actual?.version === c.recibida?.version && actual?.manoNumero === c.recibida?.manoNumero
      && actual?.indicaciones?.length === c.recibida?.indicaciones?.length) {
    if (actual === c.recibida) return c;
    let cargado = c.cargado;
    const pasos = c.pasos.map(p => {
      if (p.partida !== c.recibida) return p;
      const alDia = { ...p, partida: actual };
      if (p === c.cargado) cargado = alDia;
      return alDia;
    });
    return { ...c, recibida: actual, pasos, cargado };
  }
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

/** Lo que tarda el reparto que anuncian `eventos`, o 0 si no hay. La cola no avanza mientras tanto. */
export function esperaDelReparto(eventos: readonly Evento[], partida: unknown, liviano: boolean): number {
  if (!eventos.some(e => e.tipo === "reparto") || !esMostrada(partida)) return 0;
  return duracionDelReparto(liviano, partida.vista.equipoPorAsiento.length);
}

/** Cuánto queda en pantalla `paso`: su espera más lo que falte del reparto que termina en `repartoHasta`. */
export function esperaDelPaso(paso: Paso<unknown>, liviano: boolean, repartoHasta: number, ahora: number): number {
  return duracion(paso, liviano) + Math.max(0, repartoHasta - ahora);
}

export type Evento =
  | { tipo: "reparto"; dador: number }
  | { tipo: "carta"; asiento: number; carta: CardId; propia: boolean }
  | { tipo: "canto"; asiento: number; texto: string; paraMi: boolean }
  | { tipo: "frase"; emisor: number; destinatario: number; pie: FrasePie; texto: string; paraMi: boolean }
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

function esPropia(voz: Voz, miAsiento: number | null) {
  return voz.indice === 0 && voz.asiento === miAsiento;
}

export function cantoDeVoz(partida: Mostrada, voz: Voz, miAsiento: number | null): Evento {
  const mio = equipoDe(partida, miAsiento);
  const paraMi = mio != null && voz.indice === 0 && pidenRespuesta.has(voz.texto)
    && equipoDe(partida, voz.asiento) !== mio;
  return { tipo: "canto", asiento: voz.asiento, texto: voz.texto, paraMi };
}

// En tercetos cada duelo del pico a pico trae sus propias acciones. No se compara el largo
// de `historialLances`: el paso que cierra un duelo ya lo archiva y todavía muestra sus acciones.
function mismoLance(antes: Mostrada, despues: Mostrada) {
  return antes.manoNumero === despues.manoNumero && antes.lance.tipo === despues.lance.tipo
    && antes.lance.duelo === despues.lance.duelo && antes.vista.acciones.length <= despues.vista.acciones.length;
}

/**
 * Compara dos estados mostrados. En otra mano o en otro duelo todo lo de después es nuevo.
 * Los cantos propios no suenan: el jugador ya los tocó (sí sus tantos, que declara el árbitro).
 */
export function eventosEntre(antes: Mostrada | undefined, despues: Mostrada, miAsiento: number | null,
    nombre?: Nombre): Evento[] {
  if (!antes) return [];
  const eventos: Evento[] = [];
  const mio = equipoDe(despues, miAsiento);
  const vista = despues.vista;
  const otraMano = antes.manoNumero !== despues.manoNumero;
  if (otraMano) eventos.push({ tipo: "reparto", dador: vista.dador });

  const base = mismoLance(antes, despues) ? antes.vista : { acciones: [], vueltas: [], cobros: [] };

  for (let i = base.acciones.length; i < vista.acciones.length; i++) {
    const accion = vista.acciones[i];
    if (accion.tipo === "carta") {
      eventos.push({ tipo: "carta", asiento: accion.asiento, carta: accion.carta,
        propia: miAsiento != null && accion.asiento === miAsiento });
    } else {
      for (const voz of vocesEnAccion(vista, i)) {
        if (!esPropia(voz, miAsiento)) eventos.push(cantoDeVoz(despues, voz, miAsiento));
      }
    }
  }

  const dichas = otraMano ? 0 : antes.indicaciones?.length ?? 0;
  for (const d of despues.indicaciones?.slice(dichas) ?? []) {
    eventos.push({ tipo: "frase", emisor: d.emisor, destinatario: d.destinatario, pie: d.frase,
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

interface EnPantalla {
  partida: unknown;
  voz?: Voz;
}

export function esMostrada(p: unknown): p is Mostrada {
  return typeof p === "object" && p !== null && "vista" in p && p.vista != null;
}

// Sin un paso que lo presente, una jugada ajena nueva o un cambio de duelo es un salto al presente.
function salto(antes: Mostrada, despues: Mostrada, miAsiento: number | null) {
  if (!mismoLance(antes, despues)) return true;
  return despues.vista.acciones.slice(antes.vista.acciones.length)
    .some(a => a.tipo === "carta" || a.asiento !== miAsiento);
}

/**
 * Lo que se anuncia la primera vez que la pantalla muestra una partida. Si la espera de la mesa
 * se vio en la sala (`presencio`), su primera mano se reparte a la vista; si no, aparece repartida.
 */
export function eventosAlAbrir(partida: unknown, presencio: boolean): Evento[] {
  if (!presencio || !esMostrada(partida) || partida.manoNumero !== 1) return [];
  return [{ tipo: "reparto", dador: partida.vista.dador }];
}

/**
 * Los eventos de un cambio de pantalla. `porPaso` dice si la pantalla nueva la pone un paso
 * de la cola. Un salto sin paso (mano perdida, reparto no presenciado) no anima el pasado:
 * solo avisa el reparto y el chico terminado.
 */
export function eventosEnPantalla(previo: EnPantalla, actual: EnPantalla, porPaso: boolean,
    miAsiento: number | null, nombre?: Nombre): Evento[] {
  const { partida, voz } = actual;
  if (!esMostrada(partida) || !esMostrada(previo.partida)) return [];
  if (previo.partida === partida && previo.voz === voz) return [];
  let eventos = eventosEntre(previo.partida, partida, miAsiento, nombre);
  if (!porPaso && salto(previo.partida, partida, miAsiento)) {
    return eventos.filter(e => e.tipo === "reparto" || e.tipo === "chico");
  }
  if (voz) {
    // Las voces de una misma acción tienen un paso cada una: suena la que está en pantalla.
    const donde = eventos.findIndex(e => e.tipo !== "reparto" && e.tipo !== "carta");
    eventos = eventos.filter(e => e.tipo !== "canto");
    if (voz !== previo.voz) eventos.splice(donde < 0 ? eventos.length : donde, 0, cantoDeVoz(partida, voz, miAsiento));
  }
  return eventos;
}
