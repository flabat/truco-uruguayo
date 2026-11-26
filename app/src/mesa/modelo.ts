import { canto } from "@eltruco/cliente/cantos.ts";
import type { Mesa, Partida, PartidaTercetos, Tipo } from "@eltruco/cliente/cliente.ts";
import type { ResumenMesa } from "@eltruco/cliente/salon.ts";
import { entreCartas, vueltaCompleta, type Paso, type PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { motivoDelCobro } from "@eltruco/cliente/cobros.ts";
import { descripcionDeIndicacion, descripcionDeJugada, nombrar, tantos, vozDeIndicacion } from "@eltruco/cliente/textos.ts";
import { estadoDelTurno, palabraDeTercetos, tanteador, tituloDeRespuesta } from "@eltruco/cliente/turno.ts";
import { pausaDeVoz, vocesEnAccion, vocesEnReposo, type Voz } from "@eltruco/cliente/voces.ts";
import { vueltaEnMesa } from "@eltruco/cliente/vuelta-en-mesa.ts";
import type { EntradaMesa } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { AccionOnline, LanceTercetos, PruebaDeTantos, ResumenLance, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { resumirTantos, type ResumenTantos } from "@eltruco/motor/resumen-tantos.ts";
import type { IndicacionPie, VistaPie } from "@eltruco/motor/senas-pie.ts";
import type { tableroEspectador } from "../../../api/tablero-espectador.ts";
import { textoCierreAbandono } from "./abandono.ts";
import { avisoDeCanto, type EntradaHoja } from "./hoja-cantos.ts";

export interface AsientoVisible {
  asiento: number;
  nombre: string;
  equipo: 0 | 1;
  inicial: string;
  papel: "Vos" | "Tu pareja" | "Compañero" | "Rival" | "Equipo 1" | "Equipo 2";
  etiquetas: ("Mano" | "Dador" | "Pie")[];
  /** Cartas que le quedan. Las del propio jugador se ven en su mano, no como dorsos. */
  enMano: number;
  /** La carta en el paño en esta vuelta, o la de la vuelta cerrada que sigue a la vista. */
  jugada: CardId | null;
  ganadora: boolean;
  parda: boolean;
  turno: boolean;
  /** Tercetos: «Ya jugó», «En duelo», «Duelo 3», «Sin jugar». */
  estadoPico: string | null;
}

export interface FinDeMano {
  titulo: string;
  motivo: string;
  cobros: { equipo: string; texto: string }[];
  pruebas: { nombre: string; titulo: string; cartas: CardId[] }[];
  tituloCobros: "Tantos de esta mano" | "Tantos de este reparto";
  boton: "Repartir otra mano" | "Crear otra mesa";
}

export interface MesaVisible {
  modalidad: "1v1" | "2v2" | "3v3";
  /** Null para el espectador. */
  propio: number | null;
  vistaDesde: number;
  dador: number;
  mano: number;
  muestra: CardId;
  asientos: AsientoVisible[];
  manoPropia: CardId[];
  puedeJugarCarta: boolean;
  legales: readonly Tipo[];
  /** `texto`: «Nos 12 · 9 Ellos · a 30». */
  tanteador: { texto: string; nos: number; ellos: number; meta: number };
  estado: { titulo: string; indicacion: string };
  lance: { tipo: "redondilla" } | { tipo: "pico"; activos: readonly [number, number]; duelo: number } | null;
  etiquetaLance: string | null;
  vuelta: number;
  /** Globos de canto vigentes: los del reposo o el paso que se presenta. */
  voces: Voz[];
  fin: FinDeMano | null;
}

type Nombre = (asiento: number) => string;

const inicialDe = (nombre: string) => nombre.charAt(0).toLocaleUpperCase("es-UY") || "?";

// Como `Intl.ListFormat("es-UY")`, que Hermes no trae en todas las plataformas.
const enLista = (partes: string[]) =>
  partes.length < 2 ? partes.join("") : partes.slice(0, -1).join(", ") + " y " + partes.at(-1);

/** Lo que pasó en la mano, con el orden y los textos de `HistorialDeMano` de la mesa web. */
export function historialDeMano(
  vista: Pick<VistaOnline, "acciones" | "cobros">, indicaciones: readonly IndicacionPie[] | undefined, nombre: Nombre,
): string[] {
  const entradas: string[] = [];
  const pendientes = indicaciones ?? [];
  const flor = vista.cobros.find(c => c.comparacionFlor);
  const envido = vista.cobros.find(c => c.comparacionEnvido)?.comparacionEnvido;
  let cursor = 0;
  for (let i = 0; i <= vista.acciones.length; i++) {
    while (cursor < pendientes.length && pendientes[cursor].indiceAccion === i) {
      entradas.push(descripcionDeIndicacion(pendientes[cursor++], nombre));
    }
    if (i === vista.acciones.length) break;
    entradas.push(descripcionDeJugada(vista.acciones, i, nombre));
    if (envido?.indiceAccion === i) {
      // Quien no le gana a lo ya dicho no muestra su tanto.
      for (const p of envido.participantes) entradas.push(`${nombre(p.asiento)} dijo «${p.total ?? "Son buenas"}».`);
    }
    if (flor?.comparacionFlor?.indiceAccion !== i) continue;
    const cantadas = enLista(flor.comparacionFlor.participantes.map(p => nombre(p.asiento) + " cantó " + p.total));
    entradas.push(`Flor querida. ${cantadas}. Ganó ${nombre(flor.asiento!)} con ${flor.tantoGanador} de flor. `
      + `El equipo ${flor.equipo + 1} sumó ${tantos(flor.tantos)} al tanteador.`);
  }
  return entradas;
}

/** La misma lógica que `esperaDelCompanero` de la mesa web, sin JSX. */
export function esperaDelCompanero(pie: VistaPie | undefined, nombre: Nombre) {
  if (pie?.esperando == null) return undefined;
  return {
    titulo: nombre(pie.esperando) + " espera tu indicación",
    indicacion: "Hablale en voz alta o dejá que elija su carta en silencio.",
  };
}

/**
 * Como `estadoDelTurno`, pero un canto pendiente se anuncia con su verbo o nombra a la pareja que
 * responde. En tercetos hay dos compañeros: responde «tu equipo», salvo en el duelo. Con señas al pie,
 * el pie de la computadora responde el envido por el equipo.
 */
function estadoDeCanto(mesa: Mesa, v: Pick<VistaOnline, "pendiente" | "legales">, nombre: Nombre, participantes: readonly number[],
    pie?: VistaPie) {
  const pendiente = v.pendiente!;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const aviso = avisoDeCanto(nombre(pendiente.asiento), pendiente.tipo);
  const deRival = mesa.asientos[pendiente.asiento].equipo !== propio;
  if (deRival && v.legales.length) {
    return {
      titulo: aviso,
      indicacion: v.legales.includes("flor") ? "Cantá tu flor para responder." : "Elegí tu respuesta en Cantos.",
    };
  }
  if (deRival && pie?.responde != null) {
    return { titulo: "Responde " + nombre(pie.responde), indicacion: aviso + ". Tu pie responde por el equipo." };
  }
  const companeros = participantes.filter(a => a !== mesa.miAsiento && mesa.asientos[a]?.equipo === propio);
  const titulo = deRival && companeros.length === 1
    ? "Responde " + nombre(companeros[0])
    : tituloDeRespuesta(mesa, v, participantes);
  return { titulo, indicacion: aviso + "." };
}

function textoDeCobros(resumen: ResumenTantos, equipo: number, v: VistaOnline, nombre: Nombre) {
  const total = resumen.totales[equipo];
  const detalle = resumen.cobros.filter(c => c.equipo === equipo).map(c => {
    const ganador = c.tantoGanador != null ? ` (${c.asiento != null ? nombre(c.asiento) + " con " : ""}${c.tantoGanador})` : "";
    const valor = c.valor != null && c.valor !== c.tantos ? ` (valor de la apuesta: ${tantos(c.valor)})` : "";
    return `${tantos(c.tantos)} por ${motivoDelCobro(c, v.acciones, v.resultado)}${ganador}${valor}`;
  });
  return [(total > 0 ? "+" : "") + tantos(total), detalle.join(", ")].filter(Boolean).join(" · ");
}

function tituloDePrueba(prueba: PruebaDeTantos, acciones: readonly AccionOnline[]) {
  const tipos = prueba.motivo === "flor" ? ["contraflor-al-resto", "con-flor-envido"] : ["falta-envido", "real-envido"];
  const subida = acciones.flatMap(a => a.tipo !== "carta" && tipos.includes(a.tipo) ? [a.tipo] : []).at(-1);
  return [
    (prueba.motivo === "flor" ? "Flor ganadora" : "Envido ganador") + " · " + tantos(prueba.total),
    subida && canto[subida],
    prueba.duelo && "Duelo " + prueba.duelo,
  ].filter(Boolean).join(" · ");
}

function resumenDe(v: Pick<VistaOnline, "resumenTantos" | "cobros">): ResumenTantos {
  if (v.resumenTantos) return v.resumenTantos;
  const totales: [number, number] = [0, 0];
  for (const c of v.cobros) totales[c.equipo] += c.tantos;
  return { totales, cobros: v.cobros };
}

export function mesaDeJugador(mesa: Mesa, partida: Partida, p: { voz?: Voz; presentando: boolean }): MesaVisible {
  const v = partida.vista;
  const yo = mesa.miAsiento;
  const propio = mesa.asientos[yo].equipo;
  const nombre: Nombre = a => mesa.asientos[a]?.nombre ?? "";
  const equipo = (e: number) => mesa.modo === "1v1" ? (e === propio ? "Vos" : "Rival") : e === propio ? "Nos" : "Ellos";
  const resultado = v.resultado;
  const fase = partida.contexto.fase;

  const { cerrada, vuelta, numeroVuelta, detalleVuelta, jugadaVisible } = vueltaEnMesa(v, partida.lance.activos.length, nombre);
  const ganador = cerrada?.resultado.tipo === "ganada" ? cerrada.resultado.asiento : null;
  const jugadas = v.acciones.filter(a => a.tipo === "carta");

  const pruebaPropia = resultado ? v.pruebasDeTantos?.find(pr => pr.asiento === yo) : undefined;
  const manoPropia = v.cartas.filter(carta => !pruebaPropia?.cartas.includes(carta));
  // Las cartas de una prueba se ven en el fin de mano: sus dorsos se ocultan para no duplicarlas.
  const conPrueba = new Set<number>(resultado ? (v.pruebasDeTantos ?? []).map(pr => pr.asiento) : []);

  const asientos = mesa.asientos.map((a): AsientoVisible => {
    const nombreAsiento = a.nombre ?? "";
    const jugada = vuelta?.jugadas.find(j => j.asiento === a.asiento)?.carta ?? null;
    const etiquetas: AsientoVisible["etiquetas"] = [];
    if (a.asiento === v.mano) etiquetas.push("Mano");
    if (a.asiento === v.dador) etiquetas.push("Dador");
    if (a.asiento === partida.pie?.pie) etiquetas.push("Pie");
    return {
      asiento: a.asiento,
      nombre: nombreAsiento,
      equipo: a.equipo,
      inicial: inicialDe(nombreAsiento),
      papel: a.asiento === yo ? "Vos" : a.equipo === propio ? "Tu pareja" : "Rival",
      etiquetas,
      enMano: a.asiento === yo ? manoPropia.length : conPrueba.has(a.asiento) ? 0
        : Math.max(0, 3 - jugadas.filter(j => j.asiento === a.asiento).length),
      jugada,
      ganadora: jugada !== null && ganador === a.asiento,
      parda: jugada !== null && cerrada?.resultado.tipo === "parda",
      turno: v.turno === a.asiento,
      estadoPico: null,
    };
  });

  const relato = p.voz
    ? { titulo: nombre(p.voz.asiento), indicacion: p.voz.texto }
    : { titulo: "Vuelta " + numeroVuelta, indicacion: detalleVuelta || jugadaVisible };
  let estado: MesaVisible["estado"];
  if (p.presentando && !resultado) estado = relato;
  else if (resultado) {
    const cierre = estadoDelTurno(mesa, partida, v);
    estado = { titulo: cierre.titulo, indicacion: cierre.indicacion + (detalleVuelta ? " " + detalleVuelta : "") };
  } else {
    estado = esperaDelCompanero(partida.pie, nombre)
      ?? (v.pendiente && v.porDeclararFlor === null
        ? estadoDeCanto(mesa, v, nombre, mesa.asientos.map(a => a.asiento), partida.pie)
        : estadoDelTurno(mesa, partida, v));
  }

  let fin: FinDeMano | null = null;
  // La tarjeta aparece cuando termina de mostrarse la última carta.
  if (resultado && !p.presentando) {
    const cierre = estadoDelTurno(mesa, partida, v);
    const resumen = resumenDe(v);
    fin = {
      titulo: cierre.titulo,
      motivo: cierre.indicacion,
      cobros: [propio, 1 - propio].map(e => ({ equipo: equipo(e), texto: textoDeCobros(resumen, e, v, nombre) })),
      pruebas: (v.pruebasDeTantos ?? []).map(pr => ({ nombre: nombre(pr.asiento), titulo: tituloDePrueba(pr, v.acciones), cartas: [...pr.cartas] })),
      tituloCobros: "Tantos de esta mano",
      boton: fase === "chico-terminado" ? "Crear otra mesa" : "Repartir otra mano",
    };
  }
  // Si la partida se cerró porque alguien salió, el fin lo dice aunque la mano haya quedado a medias.
  const salida = partida.cierreAbandono;
  if (salida && !p.presentando) {
    const titulo = partida.ganadorPartida === propio ? "Ganaste la partida" : "Ganó el rival";
    const motivo = textoCierreAbandono(salida.nombre, salida.motivo);
    estado = { titulo, indicacion: motivo };
    fin = { cobros: [], pruebas: [], tituloCobros: "Tantos de esta mano", ...fin, titulo, motivo, boton: "Crear otra mesa" };
  }

  const datos = tanteador(partida.meta, partida.puntos, propio, equipo);
  const [nos, ellos] = datos.equipos;
  return {
    modalidad: mesa.modo,
    propio: yo,
    vistaDesde: yo,
    dador: v.dador,
    mano: v.mano,
    muestra: v.muestra,
    asientos,
    manoPropia,
    puedeJugarCarta: !p.presentando && !resultado && v.turno === yo && v.legales.includes("carta"),
    legales: v.legales,
    tanteador: {
      texto: `${nos.nombre} ${nos.puntos} · ${ellos.puntos} ${ellos.nombre} · a ${partida.meta}`,
      nos: nos.puntos,
      ellos: ellos.puntos,
      meta: partida.meta,
    },
    estado,
    lance: null,
    etiquetaLance: null,
    vuelta: numeroVuelta,
    voces: p.voz ? [p.voz] : vocesEnReposo(v),
    fin,
  };
}

const motivoDelCierre = { vueltas: "las vueltas", rechazo: "el rechazo", envido: "el envido", flor: "la flor", mazo: "el retiro al mazo" };
const nombreDelLance = (lance: LanceTercetos) => lance.tipo === "redondilla" ? "Redondilla" : `Duelo ${lance.duelo} de 3`;
const esElLance = (a: LanceTercetos, b: LanceTercetos) => a.tipo === b.tipo && a.duelo === b.duelo;

/** Las cartas propias de la última vista «jugando» de un reparto, que la app recuerda. */
export interface CartasRecordadas {
  manoNumero: number;
  cartas: readonly CardId[];
}

/** Guarda las cartas propias mientras el asiento juega; si no, conserva las que ya tenía. */
export function recordarCartas(previa: CartasRecordadas | null, partida: PartidaTercetos): CartasRecordadas | null {
  const v = partida.vista;
  if (v.estado !== "jugando") return previa;
  if (previa?.manoNumero === partida.manoNumero && previa.cartas.length === v.cartas.length
      && previa.cartas.every((c, i) => c === v.cartas[i])) return previa;
  return { manoNumero: partida.manoNumero, cartas: [...v.cartas] };
}

/**
 * Quien espera su duelo no tiene cartas: el servidor se las manda al abrirse su duelo. Lo recordado
 * solo muestra (sin poder jugarlas) las que le sobraron después de jugar el propio duelo.
 */
export function cartasDeLaEspera(recordadas: CartasRecordadas | null, partida: PartidaTercetos, asiento: number): CardId[] {
  const v = partida.vista;
  if (v.estado !== "esperando" || recordadas?.manoNumero !== partida.manoNumero) return [];
  const acciones = [...partida.historialLances.flatMap(l => l.acciones), ...v.acciones];
  const jugadas = new Set(acciones.flatMap(a => a.tipo === "carta" && a.asiento === asiento ? [a.carta] : []));
  return recordadas.cartas.filter(c => !jugadas.has(c));
}

/** La mesa común de un lance: la redondilla o el duelo, con sus participantes y sin el pie en el pico a pico. */
function lanceComoPartida(partida: PartidaTercetos, cartasEnEspera: readonly CardId[] = []): Partida {
  const { formato: _formato, historialLances: _historial, lance, vista, ...resto } = partida;
  return {
    ...resto,
    pie: lance.tipo === "pico-a-pico" ? undefined : partida.pie,
    lance: { tipo: "simple", duelo: null, activos: lance.activos },
    // Invariante: fuera de «jugando» la vista no trae `tantosPropios` y `legales` está vacío. La mesa
    // común no lee `tantosPropios` y `datosDeHojas` se guarda de su ausencia; sin legales no se juega.
    vista: (vista.estado === "jugando" ? vista : { ...vista, cartas: [...cartasEnEspera] }) as VistaOnline,
  };
}

/** La mesa de tercetos: la de parejas con círculos, el lance y el estado de cada puesto en el pico a pico. */
export function mesaDeTercetos(mesa: Mesa, partida: PartidaTercetos,
    p: { voz?: Voz; presentando: boolean; cartasEnEspera?: readonly CardId[] }): MesaVisible {
  const base = mesaDeJugador(mesa, lanceComoPartida(partida, p.cartasEnEspera), p);
  const v = partida.vista;
  const { lance, historialLances } = partida;
  const yo = mesa.miAsiento;
  const propio = mesa.asientos[yo].equipo;
  const nombre: Nombre = a => mesa.asientos[a]?.nombre ?? "";
  const esPico = lance.tipo === "pico-a-pico";
  const terminado = v.estado === "terminado";
  const resultado = v.resultado;

  const numeroDeDuelo = (asiento: number) => 1 + ((asiento - v.mano + 6) % 3);
  const yaJugaron = new Set<number>(historialLances.flatMap(l => l.activos));
  // Como `estadoDelPuesto` de la mesa web, con «Duelo 3» en vez de «Espera el duelo 3».
  const estadoPico = (asiento: number) => {
    if (!esPico) return null;
    if (yaJugaron.has(asiento)) return "Ya jugó";
    if (terminado) return "Sin jugar";
    if (lance.activos.some(a => a === asiento)) return "En duelo";
    return "Duelo " + numeroDeDuelo(asiento);
  };
  const asientos = base.asientos.map((a): AsientoVisible => ({
    ...a,
    papel: a.asiento === yo ? "Vos" : a.equipo === propio ? "Compañero" : "Rival",
    estadoPico: estadoPico(a.asiento),
    enMano: esPico && terminado ? 0 : a.enMano,
  }));

  const cierre = resultado && `El cierre fue por ${motivoDelCierre[resultado.motivo]}.`;
  let estado = base.estado;
  if (resultado) {
    if (!p.presentando) estado = { titulo: palabraDeTercetos(mesa, partida), indicacion: cierre! };
  } else if (!p.presentando) {
    const dueloPropio = numeroDeDuelo(yo);
    const indicacion = v.estado !== "esperando" ? base.estado.indicacion
      : dueloPropio > (lance.duelo ?? 0) ? `Te toca en el duelo ${dueloPropio} de 3.` : "Ya jugaste tu duelo. Esperá el próximo reparto.";
    estado = esperaDelCompanero(esPico ? undefined : partida.pie, nombre)
      ?? (v.pendiente && v.porDeclararFlor === null
        ? estadoDeCanto(mesa, v, nombre, lance.activos, esPico ? undefined : partida.pie)
        : { titulo: palabraDeTercetos(mesa, partida), indicacion });
  }

  let fin: FinDeMano | null = null;
  if (resultado && base.fin) {
    const { totales } = v.resumenReparto ?? resumenDe(v);
    const accionesDelDuelo = (duelo?: number) => historialLances.find(l => l.duelo === duelo)?.acciones ?? v.acciones;
    fin = {
      ...base.fin,
      titulo: palabraDeTercetos(mesa, partida),
      motivo: cierre!,
      cobros: [propio, 1 - propio].map(e => ({ equipo: e === propio ? "Nos" : "Ellos", texto: (totales[e] > 0 ? "+" : "") + tantos(totales[e]) })),
      pruebas: (v.pruebasDeTantos ?? []).map(pr => ({
        nombre: nombre(pr.asiento), titulo: tituloDePrueba(pr, accionesDelDuelo(pr.duelo)), cartas: [...pr.cartas],
      })),
      tituloCobros: "Tantos de este reparto",
    };
  }
  if (partida.cierreAbandono && base.fin) {
    const titulo = palabraDeTercetos(mesa, partida);
    estado = { ...base.estado, titulo };
    fin = { ...(fin ?? base.fin), titulo, motivo: base.fin.motivo };
  }

  return {
    ...base,
    asientos,
    estado,
    fin,
    lance: esPico ? { tipo: "pico", activos: [lance.activos[0], lance.activos[1]], duelo: lance.duelo } : { tipo: "redondilla" },
    etiquetaLance: esPico ? `Pico a pico · ${nombreDelLance(lance)}` : `Reparto ${partida.manoNumero} · Redondilla · Vuelta ${base.vuelta}`,
  };
}

/** Lo que la hoja de Cantos necesita de la partida; en tercetos suma cuánto cobra cada equipo con la falta. */
export function entradaDeHoja(mesa: Mesa, partida: Partida | PartidaTercetos): EntradaHoja {
  const v = partida.vista;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  return {
    legales: v.legales,
    pendiente: v.pendiente,
    trucoPendiente: v.trucoPendiente,
    porDeclararFlor: v.porDeclararFlor,
    miAsiento: mesa.miAsiento,
    nombre: a => mesa.asientos[a]?.nombre ?? "",
    ...("tantosPropios" in v && { tantosPropios: v.tantosPropios }),
    ...(partida.formato === "triples" && {
      falta: { propio: partida.vista.faltaPorEquipo[propio], rival: partida.vista.faltaPorEquipo[1 - propio] },
    }),
  };
}

export function entradaDeGeometria(m: MesaVisible, pantalla: { ancho: number; alto: number }, hoja: { alto: number } | null): EntradaMesa {
  const cartas: number[] = [];
  for (const a of m.asientos) cartas[a.asiento] = a.asiento === m.propio ? m.manoPropia.length : a.enMano;
  return {
    ancho: pantalla.ancho,
    alto: pantalla.alto,
    modalidad: m.modalidad,
    ...(m.lance && { lance: m.lance.tipo === "pico" ? { tipo: "pico", activos: m.lance.activos } : { tipo: "redondilla" } }),
    propio: m.propio,
    vistaDesde: m.vistaDesde,
    dador: m.dador,
    mano: m.mano,
    cartas,
    hoja,
  };
}

export interface DatosDeHojas {
  /** «Mano 4 · Vuelta 2». */
  encabezado: string;
  historial: string[];
  vueltas: { numero: string; ganador: string; jugadas: string }[];
  /** Null cuando ya terminó la mano o se presenta una voz, como el panel de la mesa web. */
  cuenta: { tusTantos: string; valor: string } | null;
  cobrados: { titulo: string; filas: { equipo: string; texto: string }[] };
  /** Solo tercetos: la redondilla o los duelos ya cerrados del reparto, como `LanceCerrado` de la mesa web. */
  reparto?: LanceDelReparto[];
}

export interface LanceDelReparto {
  /** «Redondilla» o «Duelo 2 de 3». */
  titulo: string;
  /** «Ganó tu equipo por las vueltas · Nos 19 · 22 Ellos». */
  resultado: string;
  /** «Nos +1 tanto · Ellos 0 tantos». */
  tantos: string;
  /** Vacío en el lance que sigue en la mesa: su historial ya está arriba. */
  historial: string[];
  vueltas: DatosDeHojas["vueltas"];
  cobros: DatosDeHojas["cobrados"]["filas"];
}

type Equipo = (e: number) => string;

function filasDeVueltas(vueltas: VistaOnline["vueltas"], equipo: Equipo, nombre: Nombre): DatosDeHojas["vueltas"] {
  return vueltas.map((vuelta, i) => ({
    numero: i + 1 + ".ª vuelta",
    ganador: vuelta.resultado.tipo === "parda" ? "Parda" : equipo(vuelta.resultado.equipo),
    jugadas: vuelta.jugadas.map(j => nombre(j.asiento) + " · " + nombrar(j.carta)).join(", "),
  }));
}

function filasDeCobros(cobros: VistaOnline["cobros"], acciones: readonly AccionOnline[], resultado: VistaOnline["resultado"],
    equipo: Equipo, nombre: Nombre): DatosDeHojas["cobrados"]["filas"] {
  return cobros.map(c => ({
    equipo: equipo(c.equipo) + " · " + tantos(c.tantos),
    texto: "por " + motivoDelCobro(c, acciones, resultado)
      + (c.tantoGanador != null ? " (" + (c.asiento != null ? nombre(c.asiento) + " con " : "") + c.tantoGanador + ")" : ""),
  }));
}

/** El contenido de las hojas Mano y Tantos, con los textos del panel de `Tablero` de la mesa web. */
export function datosDeHojas(mesa: Mesa, partida: Partida, visible: MesaVisible, p: { voz?: Voz; presentando: boolean }): DatosDeHojas {
  const v = partida.vista;
  const nombre: Nombre = a => mesa.asientos[a]?.nombre ?? "";
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const equipo = (e: number) => mesa.modo === "1v1" ? (e === propio ? "Vos" : "Rival") : e === propio ? "Nos" : "Ellos";
  const resultado = v.resultado;
  const cobrados = filasDeCobros(v.resumenTantos?.cobros ?? v.cobros, v.acciones, resultado, equipo, nombre);
  return {
    encabezado: "Mano " + partida.manoNumero + " · Vuelta " + visible.vuelta,
    historial: historialDeMano(v, partida.indicaciones, nombre),
    vueltas: filasDeVueltas(v.vueltas, equipo, nombre),
    // En tercetos, quien espera su duelo no tiene tantos propios (ver `lanceComoPartida`).
    cuenta: resultado || (p.presentando && p.voz) || !v.tantosPropios ? null : {
      tusTantos: v.tantosPropios.total + " de " + v.tantosPropios.modalidad,
      valor: tantos(v.valorTruco),
    },
    cobrados: resultado && visible.fin
      ? { titulo: visible.fin.tituloCobros, filas: visible.fin.cobros }
      : { titulo: "Tantos cobrados", filas: cobrados },
  };
}

/** Las hojas Reparto y Tantos de tercetos: las del lance en la mesa más los lances cerrados del reparto. */
export function datosDeTercetos(mesa: Mesa, partida: PartidaTercetos, visible: MesaVisible,
    p: { voz?: Voz; presentando: boolean }): DatosDeHojas {
  const { lance } = partida;
  const comun = lanceComoPartida(partida);
  const datos = datosDeHojas(mesa, { ...comun, indicaciones: lance.tipo === "pico-a-pico" ? undefined : partida.indicaciones },
    visible, p);
  const nombre: Nombre = a => mesa.asientos[a]?.nombre ?? "";
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const equipo: Equipo = e => e === propio ? "Nos" : "Ellos";
  const cerrado = (l: ResumenLance): LanceDelReparto => {
    const { totales } = resumirTantos(l.cobros);
    return {
      titulo: nombreDelLance(l),
      resultado: (l.resultado.equipo === propio ? "Ganó tu equipo" : "Ganaron los rivales") + " por " + motivoDelCierre[l.resultado.motivo]
        + ` · Nos ${l.puntos[propio]} · ${l.puntos[1 - propio]} Ellos`,
      tantos: [propio, 1 - propio].map(e => equipo(e) + " " + (totales[e] > 0 ? "+" : "") + tantos(totales[e])).join(" · "),
      historial: esElLance(l, lance) ? [] : l.acciones.map((_, i) => descripcionDeJugada(l.acciones, i, nombre)),
      vueltas: filasDeVueltas(l.vueltas, equipo, nombre),
      cobros: filasDeCobros(l.cobros, l.acciones, l.resultado, equipo, nombre),
    };
  };
  const etiqueta = lance.tipo === "pico-a-pico" ? "Pico a pico · " + nombreDelLance(lance) : "Redondilla";
  // El lance en la mesa ya archivado muestra sus vueltas en su apartado del reparto.
  const archivado = partida.historialLances.some(l => esElLance(l, lance));
  return {
    ...datos,
    vueltas: archivado ? [] : datos.vueltas,
    encabezado: `Reparto ${partida.manoNumero} · ${etiqueta} · Vuelta ${visible.vuelta}`,
    reparto: partida.historialLances.map(cerrado),
  };
}

/** La respuesta de `/api/salon/mesas/<id>`: el tablero público, sin el punto de vista de ningún jugador. */
export interface MesaObservada extends ResumenMesa {
  asientos: { asiento: number; equipo: number; tipo: "humano" | "computadora"; nombre: string }[];
  estado: "en-juego" | "terminada" | "interrumpida";
  vozDisponible?: boolean;
  versionReglas?: number;
  politica?: string;
  edicionModelo?: { nombre: string; publicado?: string };
  tablero: ReturnType<typeof tableroEspectador>;
}

const tituloObservada = { "en-juego": "La mano en juego", terminada: "Partida terminada", interrumpida: "Partida interrumpida" };

/** La frase del pie que sigue en el aire: la dicha antes de la próxima acción. */
function fraseEnElAire(m: MesaObservada) {
  const ultima = m.tablero.indicaciones?.at(-1);
  return ultima?.indiceAccion === m.tablero.acciones.length ? ultima : undefined;
}

/** Como `resumenDeLaMano` del visor web. */
function resumenDeLaMano(m: MesaObservada, nombre: Nombre) {
  if (m.estado === "interrumpida") return "La exhibición terminó sin ganador.";
  if (m.estado === "terminada") return "Ganó el equipo " + (m.puntos[0] > m.puntos[1] ? 1 : 2) + ".";
  if (m.tablero.resultado) return "El equipo " + (m.tablero.resultado.equipo + 1) + " ganó la mano.";
  const frase = fraseEnElAire(m);
  if (frase) return descripcionDeIndicacion(frase, nombre);
  const { acciones } = m.tablero;
  return acciones.length ? descripcionDeJugada(acciones, acciones.length - 1, nombre) : "Se repartieron las cartas.";
}

/**
 * La mesa del espectador: la de un jugador sin mano propia, vista desde el asiento 0. Los equipos
 * se nombran por sus jugadores. La frase del pie es pública; los gestos nunca llegan al tablero.
 */
export function mesaDeEspectador(m: MesaObservada, p: { voz?: Voz } = {}): MesaVisible {
  const t = m.tablero;
  const nombre: Nombre = a => m.asientos[a]?.nombre ?? "";
  const { cerrada, vuelta, numeroVuelta } = vueltaEnMesa(t, m.asientos.length, nombre);
  const ganador = cerrada?.resultado.tipo === "ganada" ? cerrada.resultado.asiento : null;
  const jugadas = t.acciones.filter(a => a.tipo === "carta");
  const asientos = m.asientos.map((a): AsientoVisible => {
    const equipo = a.equipo === 1 ? 1 : 0;
    const jugada = vuelta?.jugadas.find(j => j.asiento === a.asiento)?.carta ?? null;
    const etiquetas: AsientoVisible["etiquetas"] = [];
    if (a.asiento === t.mano) etiquetas.push("Mano");
    if (a.asiento === t.dador) etiquetas.push("Dador");
    return {
      asiento: a.asiento,
      nombre: a.nombre,
      equipo,
      inicial: inicialDe(a.nombre),
      papel: equipo === 0 ? "Equipo 1" : "Equipo 2",
      etiquetas,
      enMano: Math.max(0, 3 - jugadas.filter(j => j.asiento === a.asiento).length),
      jugada,
      ganadora: jugada !== null && ganador === a.asiento,
      parda: jugada !== null && cerrada?.resultado.tipo === "parda",
      turno: t.turnoDeCartas === a.asiento,
      estadoPico: null,
    };
  });
  const pareja = (e: number) => m.asientos.filter(a => a.equipo === e).map(a => a.nombre).join(" y ");
  const frase = fraseEnElAire(m);
  return {
    modalidad: m.modo,
    propio: null,
    vistaDesde: 0,
    dador: t.dador,
    mano: t.mano,
    muestra: t.muestra,
    asientos,
    manoPropia: [],
    puedeJugarCarta: false,
    legales: [],
    tanteador: {
      texto: `${pareja(0)} ${m.puntos[0]} · ${m.puntos[1]} ${pareja(1)} · a ${m.meta}`,
      nos: m.puntos[0],
      ellos: m.puntos[1],
      meta: m.meta,
    },
    estado: { titulo: tituloObservada[m.estado], indicacion: resumenDeLaMano(m, nombre) },
    lance: null,
    etiquetaLance: null,
    vuelta: numeroVuelta,
    // La frase del pie en el aire, la voz del paso que se presenta o la última en reposo.
    voces: frase
      ? [{ asiento: frase.emisor, texto: vozDeIndicacion(frase, nombre), indice: 0 }]
      : p.voz ? [p.voz] : vocesEnReposo(t as Parameters<typeof vocesEnReposo>[0]),
    fin: null,
  };
}

/** El tablero no trae versión: la cola compara las acciones públicas y las frases del pie. */
export interface ObservadaVersionada {
  version: number;
  manoNumero: number;
  indicaciones?: readonly unknown[];
  mesa: MesaObservada;
}

export function versionarObservada(mesa: MesaObservada): ObservadaVersionada {
  return { version: mesa.tablero.acciones.length, manoNumero: mesa.manoNumero, indicaciones: mesa.tablero.indicaciones, mesa };
}

type Tablero = MesaObservada["tablero"];

/**
 * Los pasos del espectador: las cartas nuevas de la misma mano, una por paso, y la voz de cada
 * canto nuevo, como las presenta la mesa del jugador. Al cambiar de mano o al entrar, la mesa
 * aparece al día.
 */
export const pasosDelEspectador: PasosNuevos<ObservadaVersionada | undefined> = (anterior, actual, _presencio, pendientes = []) => {
  if (!actual || !anterior || anterior.manoNumero !== actual.manoNumero) return [];
  const previo = anterior.mesa.tablero;
  const t = actual.mesa.tablero;
  if (t.acciones.length <= previo.acciones.length) return pendientes;
  const vueltas = [...t.vueltas, ...(t.vueltaActual ? [t.vueltaActual] : [])];
  const enPaso = (tablero: Tablero): ObservadaVersionada => ({
    ...actual,
    indicaciones: tablero.indicaciones,
    mesa: { ...actual.mesa, estado: "en-juego", puntos: anterior.mesa.puntos, tablero },
  });
  const pasos: Paso<ObservadaVersionada | undefined>[] = [...pendientes];
  let cartas = previo.acciones.filter(a => a.tipo === "carta").length;
  for (let i = previo.acciones.length; i < t.acciones.length; i++) {
    const esCarta = t.acciones[i].tipo === "carta";
    if (esCarta) cartas++;
    // La vuelta de la última carta en el paño y cuántas cartas de ella ya están.
    let antes = 0;
    let k = 0;
    while (k < vueltas.length - 1 && antes + vueltas[k].jugadas.length < cartas) antes += vueltas[k++].jugadas.length;
    const enLaVuelta = cartas - antes;
    const completa = k < t.vueltas.length && enLaVuelta === t.vueltas[k].jugadas.length;
    const acciones = t.acciones.slice(0, i + 1);
    const parcial: Tablero = {
      ...t,
      ...(t.indicaciones && { indicaciones: t.indicaciones.filter(d => d.indiceAccion <= i) }),
      acciones,
      vueltas: t.vueltas.slice(0, completa ? k + 1 : k),
      vueltaActual: completa
        ? { salida: vueltas[k + 1]?.salida ?? t.vueltas[k].salida, jugadas: [] }
        : { salida: vueltas[k].salida, jugadas: vueltas[k].jugadas.slice(0, enLaVuelta) },
      turnoDeCartas: null,
      valorTruco: 1 + acciones.filter(a => ["truco", "retruco", "vale-cuatro"].includes(a.tipo)).length,
      cobros: previo.cobros,
      comparacionFlor: previo.comparacionFlor,
      resultado: null,
    };
    const ultima = i + 1 === t.acciones.length;
    if (!esCarta) {
      // El espectador no canta: suenan todas las voces.
      const voces = vocesEnAccion(t as Parameters<typeof vocesEnAccion>[0], i);
      const alDia = ultima && !t.resultado && voces.length === 1;
      for (const voz of voces) pasos.push({ partida: alDia ? actual : enPaso(parcial), voz, espera: pausaDeVoz });
      continue;
    }
    const antesDelResultado = completa ? enPaso({
      ...parcial,
      vueltas: t.vueltas.slice(0, k),
      vueltaActual: { salida: t.vueltas[k].salida, jugadas: t.vueltas[k].jugadas },
    }) : undefined;
    pasos.push({ partida: ultima ? actual : enPaso(parcial), antesDelResultado, espera: completa ? vueltaCompleta : entreCartas });
  }
  return pasos;
};

/** Lo que el visor recuerda de sus lecturas para saber si hubo un corte. */
export interface SeguimientoDelVisor {
  reconexion: number;
  enError: boolean;
  manoNumero: number | null;
}

export const seguimientoInicial: SeguimientoDelVisor = { reconexion: 0, enError: false, manoNumero: null };

/**
 * Sube `reconexion` cuando vuelven los datos tras un error o cuando se salteó una mano entera:
 * lo que llegó junto durante el corte aparece al día, sin presentarse. Sin cambios, devuelve el mismo.
 */
export function seguirConsulta(s: SeguimientoDelVisor, estado: string, manoNumero: number | undefined): SeguimientoDelVisor {
  if (estado === "error") return s.enError ? s : { ...s, enError: true };
  if (manoNumero === undefined || estado !== "listo") return s;
  const corte = s.enError || (s.manoNumero !== null && manoNumero > s.manoNumero + 1);
  if (!corte && s.manoNumero === manoNumero) return s;
  return { reconexion: s.reconexion + (corte ? 1 : 0), enError: false, manoNumero };
}

/** Las hojas Mano y Tantos del espectador, con los textos del panel del visor web. */
export function datosDelEspectador(m: MesaObservada, visible: MesaVisible): DatosDeHojas {
  const t = m.tablero;
  const nombre: Nombre = a => m.asientos[a]?.nombre ?? "";
  const equipo: Equipo = e => "Equipo " + (e + 1);
  return {
    encabezado: "Mano " + m.manoNumero + " · Vuelta " + visible.vuelta,
    historial: historialDeMano(t as Pick<VistaOnline, "acciones" | "cobros">, t.indicaciones, nombre),
    vueltas: filasDeVueltas(t.vueltas, equipo, nombre),
    cuenta: null,
    cobrados: {
      titulo: "Tantos cobrados",
      filas: t.cobros.map(c => ({
        equipo: equipo(c.equipo) + " · " + tantos(c.tantos),
        texto: "por " + c.motivo + (c.asiento != null && c.tantoGanador != null ? ` (${nombre(c.asiento)} con ${c.tantoGanador})` : ""),
      })),
    },
  };
}
