import { canto, respuestaConFlor, verboDeCanto } from "@eltruco/cliente/cantos.ts";

export { verboDeCanto };
import type { Tipo } from "@eltruco/cliente/cliente.ts";
import { tantos } from "@eltruco/cliente/textos.ts";

export type Canto = Exclude<Tipo, "carta">;

export const avisoDeCanto = (nombre: string, tipo: Canto) =>
  `${nombre} ${verboDeCanto(tipo)} ${canto[tipo].toLowerCase()}`;

export interface EntradaHoja {
  legales: readonly Tipo[];
  pendiente: { asiento: number; tipo: Canto } | null;
  trucoPendiente: { asiento: number; tipo: Canto } | null;
  porDeclararFlor: number | null;
  miAsiento: number;
  nombre: (asiento: number) => string;
  tantosPropios?: { total: number; modalidad: string };
  /** Solo tercetos: cuánto cobra cada equipo con la falta. */
  falta?: { propio: number; rival: number };
}

export interface HojaCantos {
  modo: "propia" | "respuesta" | "flor";
  /** Falso cuando te tocan, te gritan o te cantan: no se cierra sin responder. */
  cerrable: boolean;
  encabezado: string;
  detalle: string | null;
  respuestas: Canto[];
  grupos: { nombre: "Envido" | "Flor" | "Truco"; opciones: Canto[] }[];
  mazo: boolean;
  notas: string[];
}

const familias: { nombre: "Envido" | "Flor" | "Truco"; opciones: Canto[] }[] = [
  { nombre: "Envido", opciones: ["envido", "real-envido", "falta-envido"] },
  { nombre: "Flor", opciones: ["flor", "con-flor-envido", "contraflor-al-resto"] },
  { nombre: "Truco", opciones: ["truco", "retruco", "vale-cuatro"] },
];

export function hojaDeCantos(e: EntradaHoja): HojaCantos | null {
  const legales = e.legales.filter((t): t is Canto => t !== "carta");
  if (legales.length === 0) return null;
  const legal = (t: Canto) => legales.includes(t);

  const tocaDeclarar = e.porDeclararFlor === e.miAsiento;
  const deOtro = e.pendiente !== null && e.pendiente.asiento !== e.miAsiento;
  const conFlor = legal("flor") || legal("con-flor-quiero") || legal("paso-flor");
  // Con flor sin declarar, el canto del rival solo se responde cantándola: no hay quiero ni no quiero.
  const soloFlor = deOtro && !legal("quiero") && !legal("no-quiero");
  const deFlor = (tocaDeclarar || soloFlor) && conFlor;
  const modo: HojaCantos["modo"] = deFlor ? "flor" : deOtro && (legal("quiero") || legal("no-quiero")) ? "respuesta" : "propia";
  if (modo === "propia" && e.pendiente && !tocaDeclarar) return null;

  const respuestas: Canto[] = modo === "respuesta"
    ? (["quiero", "no-quiero"] as const).filter(legal)
    : modo === "flor" ? (["flor", "con-flor-quiero", "paso-flor"] as const).filter(legal) : [];
  const grupos = familias
    .map(f => ({ nombre: f.nombre, opciones: f.opciones.filter(t => legal(t) && !respuestas.includes(t)) }))
    .filter(f => f.opciones.length > 0);

  const notas: string[] = [];
  if (e.trucoPendiente && e.pendiente && e.pendiente.tipo !== e.trucoPendiente.tipo)
    notas.push(`Queda pendiente el ${canto[e.trucoPendiente.tipo].toLowerCase()} de ${e.nombre(e.trucoPendiente.asiento)}.`);
  if (legal("con-flor-quiero")) notas.push(respuestaConFlor);
  if (e.falta && (legal("falta-envido") || e.pendiente?.tipo === "falta-envido"))
    notas.push(`Falta envido · Si gana tu equipo, cobra ${tantos(e.falta.propio)}. Si ganan los rivales, cobran ${tantos(e.falta.rival)}.`);

  return {
    modo,
    cerrable: modo === "propia",
    encabezado: modo === "flor" ? "Te toca declarar"
      : modo === "respuesta" && e.pendiente ? avisoDeCanto(e.nombre(e.pendiente.asiento), e.pendiente.tipo) : "Cantos",
    detalle: modo === "propia" && e.tantosPropios ? `Tenés ${e.tantosPropios.total} de ${e.tantosPropios.modalidad}` : null,
    respuestas,
    grupos,
    mazo: legal("mazo"),
    notas,
  };
}

/**
 * La hoja de Cantos de la mesa: ninguna mientras se presenta lo último o la versión de señas es
 * desconocida. La conexión no cuenta a propósito: un corte breve no debe cerrar y reabrir la hoja
 * forzada ni volver a avisar; mientras tanto la mesa está bloqueada y el toque se ignora.
 */
export function hojaDeLaMesa({ presentando, versionDesconocida, ...entrada }: EntradaHoja & {
  presentando: boolean;
  versionDesconocida: boolean;
}): HojaCantos | null {
  return presentando || versionDesconocida ? null : hojaDeCantos(entrada);
}

/** La hoja sube sola, y avisa una vez, al entrar en respuesta o flor; si desaparece se cierra. */
export function transicionDeHoja(anterior: HojaCantos | null, actual: HojaCantos | null, abierta: boolean) {
  if (!actual) return { abierta: false, avisar: false };
  if (actual.modo === "propia")
    return { abierta: anterior?.modo === "respuesta" || anterior?.modo === "flor" ? false : abierta, avisar: false };
  // Un canto nuevo (un real envido después de tu envido) cambia el encabezado y vuelve a avisar.
  const mismo = anterior?.modo === actual.modo && anterior.encabezado === actual.encabezado;
  return { abierta: true, avisar: !mismo };
}
