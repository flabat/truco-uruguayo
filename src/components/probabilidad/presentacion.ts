import type { CardId } from "../../motor/cartas.ts";
import type { ResultadoAnalisis } from "../../probabilidad/perfil.ts";
import { nombre } from "../mesa/relato.ts";
import { textosProbabilidad } from "../../aprendizaje/probabilidad/escenas.ts";

type Completo = Extract<ResultadoAnalisis, { tipo: "completo" }>;
const enteros = new Intl.NumberFormat("es-UY", { useGrouping: "always" });
const porcentajes = new Intl.NumberFormat("es-UY", { style: "percent", maximumFractionDigits: 1 });
const puntos = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 });

function parOrientado(resultado: Completo, a: CardId, b: CardId) {
  const par = resultado.pares.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  if (!par) return null;
  if (par.a === a) return par;
  const [bajo, alto] = par.intervalo95;
  return { diferencia: -par.diferencia, intervalo95: [-alto, -bajo] };
}

export function contrastarCartas(resultado: Completo, a: CardId, b: CardId): string {
  const par = parOrientado(resultado, a, b);
  if (!par) return "";
  if (resultado.metodo === "exacto" && par.diferencia === 0) {
    return "Con " + nombre(a) + " y con " + nombre(b) + " tu pareja tiene exactamente las mismas chances.";
  }
  const diferencia = puntos.format(Math.abs(par.diferencia) * 100);
  const comparacion = par.diferencia === 0
    ? "Las dos cartas ganaron la misma cantidad de manos en la muestra."
    : "Con " + nombre(a) + " la chance de ganar la mano es " + diferencia + " puntos porcentuales " +
      (par.diferencia > 0 ? "mayor" : "menor") + " que con " + nombre(b) + ".";
  if (resultado.metodo === "exacto") return comparacion;
  const [bajo, alto] = par.intervalo95;
  const intervalo = " Intervalo de la diferencia: de " + puntos.format(100 * bajo) + " a " +
    puntos.format(100 * alto) + " puntos porcentuales (95 % para las comparaciones en conjunto).";
  return comparacion + intervalo + (bajo <= 0 && alto >= 0 ? " " + textosProbabilidad.inconclusa : "");
}

export function presentarResultado(resultado: Completo, origen: "calculo" | "referencia") {
  const n = enteros.format(resultado.mundos);
  const exacto = resultado.metodo === "exacto";
  const metodo = (origen === "referencia" ? "Cálculo de referencia · " : "") +
    (exacto ? "Enumeración exacta" : "Estimación por simulación");
  const mejor = resultado.filas.reduce((max, fila) => fila.victorias > max.victorias ? fila : max);
  const primeras = resultado.filas.filter(fila => fila.victorias === mejor.victorias);
  let lectura: string;
  if (resultado.filas.length === 1) lectura = "Te queda una sola carta. Su porcentaje describe cómo puede terminar la mano.";
  else if (exacto && primeras.length > 1) lectura = "Empate exacto en el primer puesto: " + primeras.map(fila => nombre(fila.carta)).join(" y ") + ".";
  else if (exacto || resultado.filas.every(fila => fila.carta === mejor.carta ||
      (parOrientado(resultado, mejor.carta, fila.carta)?.intervalo95[0] ?? 0) > 0)) {
    lectura = "Jugar " + nombre(mejor.carta) + " le da a tu pareja más chances de ganar con estos jugadores.";
  } else lectura = "La muestra no permite distinguir una única carta con más chances.";
  return {
    metodo,
    denominador: n + (exacto ? " repartos compatibles" : " repartos simulados"),
    filas: resultado.filas.map(({ carta, frecuencia, victorias }) => ({
      carta, nombre: nombre(carta), porcentaje: porcentajes.format(frecuencia),
      victorias: enteros.format(victorias) + " de " + n,
    })),
    lectura,
  };
}

export function motivoSinCifras(tipo: Exclude<ResultadoAnalisis["tipo"], "completo">): string {
  const mensajes = {
    "entrada-invalida": "Esta posición tiene datos que no forman una mano válida.",
    "fuera-de-turno": "Podés comparar las cartas cuando te toca jugar.",
    "mano-terminada": "La mano terminó. Volvé a un turno anterior para comparar tus cartas.",
    "incompatible": "Ningún reparto explica estas jugadas con la estrategia de estos jugadores.",
    "presupuesto-agotado": "Se alcanzó el límite de cálculo antes de completar la muestra.",
  };
  return mensajes[tipo];
}
