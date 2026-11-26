import { isDeepStrictEqual } from "node:util";
import { versionSenasPie, crearIndicacionPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { esAsientoOnline } from "@eltruco/motor/reparto.ts";
import { esMetaDeChico } from "@eltruco/motor/chico.ts";
import type { Cobro, RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import type { Confirmada } from "./turnos.ts";
import { decidirChicoOnline, iniciarChicoOnline, vistaChicoOnline, type EstadoChicoOnline, type PerfilChicoOnline } from "./replay-chico-online.ts";
import { decidirGallo, iniciarGallo, vistaGallo, type AccionGallo, type EstadoGallo, type RepartoGallo } from "@eltruco/motor/replay-gallo.ts";

type Puntos = readonly [number, number];
type Controlador = { tipo: "humano" } | { tipo: "computadora"; politica: string };
type Perfil = PerfilChicoOnline | "gallo-sintetico-v1";

const perfiles = {
  duel: { variante: "duelo", cantidad: 2, motor: "online-1" },
  pairs: { variante: "parejas", cantidad: 4, motor: "online-1" },
  "pairs-private-senas": { variante: "parejas", cantidad: 4, motor: "online-1" },
  "tercetos-v1": { variante: "tercetos", cantidad: 6, motor: "online-2" },
  "gallo-sintetico-v1": { variante: "gallo", cantidad: 3, motor: "gallo-sintetico-v1" },
} as const satisfies Record<Perfil, { variante: string; cantidad: number; motor: string }>;

export interface DecisionBotV1 {
  solicitada: string;
  aplicada: string;
  observacion: string;
  acciones: string;
  fallback?: string;
  latenciaMs?: number;
  propuesta?: string;
}

export type Motivo = "abandonada" | "desconectada";

export type EventoChicoV1 = { secuencia: number } & (
  | { tipo: "reparto"; manoNumero: number; puntosInicio: Puntos; reparto: RepartoOnline | RepartoGallo }
  | { tipo: "decision"; accion: Confirmada | AccionGallo; duelo?: null | 1 | 2 | 3; bot?: DecisionBotV1; cobros: readonly Cobro[]; puntos: Puntos }
  | { tipo: "salida"; asiento: number; motivo: Motivo; fecha: string }
  | { tipo: "cierre"; fecha: string; puntos: Puntos } & (
      { estado: "terminado"; ganador: 0 | 1 } | { estado: "inconcluso"; ganador: null } | { estado: "abandonado"; ganador: 0 | 1 })
);

/** Formato privado y serializable. Los asientos son los índices del array, en orden de mesa. */
export interface ReplayChicoV1 {
  version: "chico-v1";
  id: string;
  origen: "mesa" | "arena" | "fixture";
  corrida?: { id: string; chico: string; par?: number; manga?: 0 | 1 };
  variante: "duelo" | "parejas" | "tercetos" | "gallo";
  perfil: Perfil;
  motor: { version: string; build: string };
  meta: number;
  inicio: string;
  asientos: readonly Controlador[];
  eventos: readonly EventoChicoV1[];
}

export type ReplayChicoPie = Omit<ReplayChicoV1, "version" | "eventos"> & {
  version: "chico-v2";
  versionSenas: typeof versionSenasPie;
  eventos: readonly (EventoChicoV1 | { secuencia: number; tipo: "indicacion"; indicacion: IndicacionPie })[];
};

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

function fechaUTC(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(valor)) return false;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) && new Date(ms).toISOString() === valor.replace(/(\d\d:\d\d:\d\d)Z$/, "$1.000Z");
}

function esControlador(valor: unknown): valor is Controlador {
  return objeto(valor) && ((valor.tipo === "humano" && valor.politica === undefined)
    || (valor.tipo === "computadora" && texto(valor.politica)));
}

function leerCabecera(datos: unknown) {
  if (!objeto(datos) || (datos.version !== "chico-v1" && datos.version !== "chico-v2")) throw new Error("Versión del replay de chico desconocida.");
  if (typeof datos.perfil !== "string" || !Object.hasOwn(perfiles, datos.perfil)) throw new Error("Perfil de reglas desconocido.");
  const perfil = datos.perfil as Perfil;
  const alPie = datos.version === "chico-v2";
  if (alPie ? datos.versionSenas !== versionSenasPie || (perfil !== "pairs-private-senas" && perfil !== "tercetos-v1")
            : datos.versionSenas !== undefined) throw new Error("Versión de señas incompatible con el replay.");
  const reglas = perfiles[perfil];
  if (datos.variante !== reglas.variante || !objeto(datos.motor) || datos.motor.version !== reglas.motor) {
    throw new Error("Versión de motor o variante incompatible con el perfil.");
  }
  if (typeof datos.motor.build !== "string" || !/^(git:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/.test(datos.motor.build)) {
    throw new Error("Huella del build inválida.");
  }
  if (typeof datos.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(datos.id)
    || !fechaUTC(datos.inicio) || !esMetaDeChico(datos.meta)
    || !Array.isArray(datos.asientos) || datos.asientos.length !== reglas.cantidad || !datos.asientos.every(esControlador)
    || !Array.isArray(datos.eventos)) throw new Error("Cabecera, meta o asientos inválidos.");
  const origen = datos.origen;
  if (origen !== "mesa" && origen !== "arena" && origen !== "fixture") throw new Error("Origen desconocido.");
  if (perfil === "gallo-sintetico-v1" && origen !== "fixture") throw new Error("El perfil sintético de gallo requiere un fixture.");
  if (origen === "arena") {
    const c = datos.corrida;
    if (!objeto(c) || !texto(c.id) || !texto(c.chico) || !datos.asientos.every(s => s.tipo === "computadora")
      || ((c.par !== undefined || c.manga !== undefined) && !(typeof c.par === "number" && Number.isSafeInteger(c.par)
        && c.par >= 0 && (c.manga === 0 || c.manga === 1)))) throw new Error("Corrida de computadoras inválida.");
  } else if (datos.corrida !== undefined) throw new Error("El origen no corresponde a una corrida.");
  return { id: datos.id, perfil, alPie, origen, meta: datos.meta, inicio: datos.inicio, asientos: datos.asientos, eventos: datos.eventos as unknown[] };
}

function verificarBot(control: Controlador, bot: unknown) {
  if (control.tipo === "humano") {
    if (bot !== undefined) throw new Error("Un asiento humano no lleva inferencia.");
    return;
  }
  if (!objeto(bot) || bot.solicitada !== control.politica || !texto(bot.aplicada) || !texto(bot.observacion) || !texto(bot.acciones)
    || (bot.fallback !== undefined && (!texto(bot.fallback) || bot.latenciaMs === undefined))
    || (bot.aplicada !== bot.solicitada && !texto(bot.fallback))
    || (bot.propuesta !== undefined && !texto(bot.propuesta))
    || (bot.latenciaMs !== undefined && !(typeof bot.latenciaMs === "number" && Number.isFinite(bot.latenciaMs) && bot.latenciaMs >= 0))) {
    throw new Error("Procedencia de la decisión de computadora inválida.");
  }
}

type Mano = { tipo: "online"; valor: EstadoChicoOnline } | { tipo: "gallo"; valor: EstadoGallo };

/** Lee JSON o su valor decodificado. Devuelve exclusivamente la vista del asiento al terminar esa secuencia. */
export function reproducirChico(datos: unknown, asiento: number, hasta?: number) {
  const cabecera = leerCabecera(typeof datos === "string" ? JSON.parse(datos) : datos);
  const { id, perfil, meta, asientos, eventos } = cabecera;
  const fin = hasta === undefined ? eventos.length : hasta;
  if (!Number.isInteger(asiento) || asiento < 0 || asiento >= asientos.length) throw new RangeError("Asiento fuera de la mesa.");
  if (!Number.isSafeInteger(fin) || fin < 0 || fin > eventos.length) throw new RangeError("Posición fuera del replay.");
  const humanos = cabecera.origen === "arena" ? undefined : asientos.flatMap((s, i) => s.tipo === "humano" ? [i] : []);
  let mano: Mano | undefined;
  let manoNumero = 0;
  let indicaciones: IndicacionPie[] = [];
  let dadorAnterior: number | undefined;
  let puntos: Puntos = [0, 0];
  let cierre: "terminado" | "inconcluso" | "abandonado" | undefined;
  let ganadorAbandono: number | undefined;
  let salida = false;
  for (let i = 0; i < fin; i++) {
    const e = eventos[i];
    const secuencia = i + 1;
    try {
      if (!objeto(e) || e.secuencia !== secuencia) throw new Error("Secuencia ausente o fuera de orden.");
      if (cierre) throw new Error("Evento posterior al cierre.");
      if (e.tipo === "reparto") {
        if (mano && perfil === "gallo-sintetico-v1") throw new Error("El perfil sintético de gallo cubre un único reparto.");
        if (e.manoNumero !== manoNumero + 1 || !isDeepStrictEqual(e.puntosInicio, puntos)
          || (mano && !mano.valor.terminada) || puntos.includes(meta)) throw new Error("Inicio de reparto inconsistente.");
        if (!objeto(e.reparto) || typeof e.reparto.dador !== "number"
          || (dadorAnterior !== undefined && e.reparto.dador !== (dadorAnterior + 1) % asientos.length)) throw new Error("Dador inválido.");
        manoNumero++;
        indicaciones = [];
        mano = perfil === "gallo-sintetico-v1"
          ? { tipo: "gallo", valor: iniciarGallo(e.reparto, puntos, meta) }
          : { tipo: "online", valor: iniciarChicoOnline(perfil, e.reparto, puntos, meta, manoNumero, humanos) };
        dadorAnterior = e.reparto.dador;
      } else if (e.tipo === "indicacion") {
        const i = e.indicacion;
        if (!cabecera.alPie || mano?.tipo !== "online" || !objeto(i) || !esAsientoOnline(i.emisor)) {
          throw new Error("Indicación fuera de una mano con pie.");
        }
        const validada = crearIndicacionPie(mano.valor.motor, i.emisor, i.destinatario, i.frase, i.vuelta, indicaciones, i.carta);
        if (!validada || !isDeepStrictEqual(validada, i)) throw new Error("Indicación o posición inválida.");
        indicaciones.push(validada);
      } else if (e.tipo === "decision") {
        if (!mano || !objeto(e.accion) || typeof e.accion.asiento !== "number" || !Number.isInteger(e.accion.asiento)
          || e.accion.asiento < 0 || e.accion.asiento >= asientos.length) throw new Error("Decisión sin reparto o asiento válido.");
        if (cabecera.alPie && Object.hasOwn(e.accion, "sena")) throw new Error("La versión al pie genera los gestos automáticamente.");
        verificarBot(asientos[e.accion.asiento], e.bot);
        if (mano.tipo === "gallo") {
          if (e.duelo !== undefined) throw new Error("El gallo no lleva un índice de duelo.");
          mano = { tipo: "gallo", valor: decidirGallo(mano.valor, e.accion) };
        } else {
          mano = { tipo: "online", valor: decidirChicoOnline(mano.valor, e.accion, e.duelo) };
        }
        puntos = mano.valor.puntos;
        if (!isDeepStrictEqual(e.cobros, mano.valor.cobros) || !isDeepStrictEqual(e.puntos, puntos)) {
          throw new Error("Los cobros o el tanteador difieren del motor.");
        }
      } else if (e.tipo === "salida") {
        if (!Number.isInteger(e.asiento) || (e.asiento as number) < 0 || (e.asiento as number) >= asientos.length
          || (e.motivo !== "abandonada" && e.motivo !== "desconectada") || !fechaUTC(e.fecha)
          || Date.parse(e.fecha) < Date.parse(cabecera.inicio)) throw new Error("Salida inválida.");
        salida = true;
      } else if (e.tipo === "cierre" && e.estado === "abandonado") {
        if (!mano || !salida || !fechaUTC(e.fecha) || Date.parse(e.fecha) < Date.parse(cabecera.inicio)
          || !isDeepStrictEqual(e.puntos, puntos) || puntos.includes(meta) || (e.ganador !== 0 && e.ganador !== 1)) {
          throw new Error("Cierre incompatible con el resultado del chico.");
        }
        cierre = "abandonado";
        ganadorAbandono = e.ganador;
      } else if (e.tipo === "cierre") {
        const ganador = puntos.indexOf(meta);
        const estadoEsperado = ganador < 0 ? "inconcluso" : "terminado";
        if (!mano || !fechaUTC(e.fecha) || Date.parse(e.fecha) < Date.parse(cabecera.inicio) || !isDeepStrictEqual(e.puntos, puntos)
          || e.estado !== estadoEsperado || e.ganador !== (ganador < 0 ? null : ganador)) {
          throw new Error("Cierre incompatible con el resultado del chico.");
        }
        cierre = estadoEsperado;
      } else throw new Error("Tipo de evento desconocido.");
    } catch (error) {
      throw new Error(`Secuencia ${secuencia}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  const ganador = puntos.indexOf(meta);
  const vista = !mano ? null : mano.tipo === "gallo" ? vistaGallo(mano.valor, asiento) : vistaChicoOnline(mano.valor, asiento, cabecera.alPie ? indicaciones : undefined);
  return { id, secuencia: fin, manoNumero, meta, puntos, ganador: ganadorAbandono ?? (ganador < 0 ? null : ganador),
    estado: cierre ?? (ganador < 0 ? "en-juego" : "terminado"), vista };
}
