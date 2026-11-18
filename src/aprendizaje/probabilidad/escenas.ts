import type { Jugada } from "../../motor/mano.ts";
import { versionReparto, type RepartoV1 } from "../../motor/reparto.ts";

export type Escena = "salida" | "segunda" | "practica";

export const textosProbabilidad = {
  objetivo: "Elegí una carta y compará las chances de que vos y tu compañero ganen la mano completa.",
  politica: "Cada carta se prueba sobre los mismos repartos posibles. Después de tu elección, los cuatro asientos siguen la estrategia de los jugadores automáticos de esta mesa.",
  informacion: "Usamos tus cartas, la muestra y las jugadas vistas hasta ese turno. Las jugadas del compañero y de los rivales dan pistas sobre qué cartas podían tener.",
  unidad: "Ganar una vuelta acerca a tu pareja a ganar la mano. El porcentaje cuenta las manos completas que gana tu pareja.",
  puntos: "Una ventaja de 9 puntos porcentuales significa ganar unas 9 manos más por cada 100 que se comparan.",
  estimacion: "La simulación prueba una muestra de los repartos posibles. Con otra muestra los porcentajes pueden variar.",
  exacto: "Se contaron todos los repartos posibles para lo que viste y la forma de jugar de estos bots.",
  inconclusa: "Con esta muestra, la diferencia entre estas cartas queda abierta.",
};

export const escenas = {
  salida: {
    titulo: "¿Salís con la pieza o la guardás?",
    consigna: "Sos mano. Con el 6 de copas de muestra, el 2 de copas asegura la primera vuelta. ¿Con cuál pensás que tu pareja gana más manos?",
    explicacion: "Abrir con el 3 de bastos ganó unas 9 manos más de cada 100 que abrir con el 2 de copas. Guardar la pieza deja una carta fuerte para otra vuelta.",
  },
  segunda: {
    titulo: "¿Gastás la pieza ahora?",
    consigna: "Los rivales ganaron la primera vuelta y ya jugaron el 5 de copas en la segunda. Te toca cerrar la vuelta. ¿Con cuál seguís?",
    explicacion: "Con el 5 de oros perdés la segunda vuelta y termina la mano. Con el 2 de copas ganás la vuelta y llegás a la tercera, donde tu pareja todavía puede ganar.",
  },
  practica: {
    titulo: "Probá con otra mano",
    consigna: "Mirá la muestra, las cartas de la mesa y las que te quedan. ¿Cuál le da más chances a tu pareja?",
  },
} as const;

// El estudio 44 distribuye cartas ocultas alrededor de una mano fija.
// Su número identifica el caso editorial y usa un generador distinto de repartir().
export const segundaDelEstudioV1 = {
  reparto: {
    versionReparto, semilla: 44, dador: 3, mano: 0, muestra: "copas-06",
    manos: [
      ["copas-02", "bastos-03", "oros-05"], ["oros-06", "copas-11", "espadas-06"],
      ["espadas-04", "copas-03", "espadas-03"], ["oros-10", "oros-04", "copas-05"],
    ],
  } satisfies RepartoV1,
  jugadas: [
    { asiento: 0, carta: "bastos-03" }, { asiento: 1, carta: "copas-11" },
    { asiento: 2, carta: "espadas-04" }, { asiento: 3, carta: "oros-04" },
    { asiento: 1, carta: "oros-06" }, { asiento: 2, carta: "copas-03" },
    { asiento: 3, carta: "copas-05" },
  ] satisfies readonly Jugada[],
} as const;

export const semillaSalidaV1 = 830838;
