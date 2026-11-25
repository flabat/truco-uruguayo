import { canto } from "@eltruco/cliente/cantos.ts";
import type { Mesa, Partida, Tipo } from "@eltruco/cliente/cliente.ts";
import { motivoDelCobro } from "@eltruco/cliente/cobros.ts";
import { tantos } from "@eltruco/cliente/textos.ts";
import { estadoDelTurno, tanteador, tituloDeRespuesta } from "@eltruco/cliente/turno.ts";
import { vocesEnReposo, type Voz } from "@eltruco/cliente/voces.ts";
import { vueltaEnMesa } from "@eltruco/cliente/vuelta-en-mesa.ts";
import type { EntradaMesa } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { PruebaDeTantos, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { ResumenTantos } from "@eltruco/motor/resumen-tantos.ts";
import type { VistaPie } from "@eltruco/motor/senas-pie.ts";
import { avisoDeCanto } from "./hoja-cantos.ts";

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

/** La misma lógica que `esperaDelCompanero` de la mesa web, sin JSX. */
export function esperaDelCompanero(pie: VistaPie | undefined, nombre: Nombre) {
  if (pie?.esperando == null) return undefined;
  return {
    titulo: nombre(pie.esperando) + " espera tu indicación",
    indicacion: "Hablale en voz alta o dejá que elija su carta en silencio.",
  };
}

/** Como `estadoDelTurno`, pero un canto pendiente se anuncia con su verbo o nombra a la pareja que responde. */
function estadoDeCanto(mesa: Mesa, v: VistaOnline, nombre: Nombre) {
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
  const pareja = mesa.asientos.find(a => a.asiento !== mesa.miAsiento && a.equipo === propio);
  const titulo = deRival && pareja
    ? "Responde " + nombre(pareja.asiento)
    : tituloDeRespuesta(mesa, v, mesa.asientos.map(a => a.asiento));
  return { titulo, indicacion: aviso + "." };
}

function textoDeCobros(resumen: ResumenTantos, equipo: number, v: VistaOnline, nombre: Nombre) {
  const total = resumen.totales[equipo];
  const detalle = resumen.cobros.filter(c => c.equipo === equipo).map(c => {
    const ganador = c.tantoGanador != null ? ` (${c.asiento != null ? nombre(c.asiento) + " con " : ""}${c.tantoGanador})` : "";
    const valor = c.valor != null && c.valor !== c.tantos ? ` (valor de la apuesta: ${tantos(c.valor)})` : "";
    return `${c.tantos} por ${motivoDelCobro(c, v.acciones, v.resultado)}${ganador}${valor}`;
  });
  return [(total > 0 ? "+" : "") + tantos(total), detalle.join(", ")].filter(Boolean).join(" · ");
}

function tituloDePrueba(prueba: PruebaDeTantos, v: VistaOnline) {
  const tipos = prueba.motivo === "flor" ? ["contraflor-al-resto", "con-flor-envido"] : ["falta-envido", "real-envido"];
  const subida = v.acciones.flatMap(a => a.tipo !== "carta" && tipos.includes(a.tipo) ? [a.tipo] : []).at(-1);
  return [
    (prueba.motivo === "flor" ? "Flor ganadora" : "Envido ganador") + " · " + tantos(prueba.total),
    subida && canto[subida],
    prueba.duelo && "Duelo " + prueba.duelo,
  ].filter(Boolean).join(" · ");
}

function resumenDe(v: VistaOnline): ResumenTantos {
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
      enMano: a.asiento === yo ? manoPropia.length : Math.max(0, 3 - jugadas.filter(j => j.asiento === a.asiento).length),
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
      ?? (v.pendiente && v.porDeclararFlor === null ? estadoDeCanto(mesa, v, nombre) : estadoDelTurno(mesa, partida, v));
  }

  let fin: FinDeMano | null = null;
  if (resultado) {
    const cierre = estadoDelTurno(mesa, partida, v);
    const resumen = resumenDe(v);
    fin = {
      titulo: cierre.titulo,
      motivo: cierre.indicacion,
      cobros: [propio, 1 - propio].map(e => ({ equipo: equipo(e), texto: textoDeCobros(resumen, e, v, nombre) })),
      pruebas: (v.pruebasDeTantos ?? []).map(pr => ({ nombre: nombre(pr.asiento), titulo: tituloDePrueba(pr, v), cartas: [...pr.cartas] })),
      tituloCobros: "Tantos de esta mano",
      boton: fase === "chico-terminado" ? "Crear otra mesa" : "Repartir otra mano",
    };
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
