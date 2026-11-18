import { familiasPorHabilidad, type Habilidad } from "../generadores/familias.ts";
import type { Leccion, Paso } from "../tipos.ts";
import type { CardId } from "../../motor/cartas.ts";

export interface Ejemplo {
  id: string;
  uso: "apertura" | "repaso";
  muestra: CardId;
  cartas: readonly CardId[];
  detalle: string;
}

export interface Tema extends Leccion {
  habilidad: Habilidad;
  resumen: string;
  orientacion: string;
  regla: string;
  ejemplos: readonly Ejemplo[];
  comparar?: boolean;
}

const piezas = "Del palo de la muestra, el 2, el 4, el 5, el caballo (11) y la sota (10) son piezas. Si una de ellas sale de muestra, el rey de ese palo ocupa su lugar.";
const figuras = "Las cartas comunes del as al 7 valen su número. Las figuras comunes valen cero.";
const seleccion: Paso = {
  id: "seleccion", tipo: "elegir-cartas", minimo: 1, maximo: 3,
  consigna: "¿Qué cartas entran en la cuenta?", pista: "Mirá qué palos coinciden y si tenés alguna pieza.",
};
const total: Paso = {
  id: "total", tipo: "responder-total", consigna: "¿Cuántos tantos tenés?",
  pista: "Repasá cuánto aporta cada carta elegida y si corresponde sumar 20.",
};

export const comparar: Tema = {
  id: "comparar-cartas", habilidad: "comparar-cartas", titulo: "Comparar dos cartas",
  capitulo: "jerarquia", familias: familiasPorHabilidad["comparar-cartas"], comparar: true,
  resumen: "Descubrí cuál gana una vuelta y cuándo empatan.",
  orientacion: "En una vuelta cada jugador baja una carta. Mirá primero el palo de la muestra. Sus piezas ganan a todas las demás cartas.",
  regla: piezas + " Las piezas ganan en ese orden. Les siguen las matas, de mayor a menor: as de espadas, as de bastos, 7 de espadas y 7 de oros. Entre las demás manda este orden: 3, 2, as, rey, caballo, sota, 7, 6, 5, 4. Dos cartas del mismo puesto empatan.",
  ejemplos: [
    { id: "dos-de-bastos", uso: "apertura", muestra: "bastos-06", cartas: ["bastos-02", "espadas-01"],
      detalle: "La muestra es de bastos. El 2 de bastos es la pieza más fuerte y le gana incluso al as de espadas." },
    { id: "cuatro-de-oros", uso: "apertura", muestra: "oros-06", cartas: ["espadas-01", "oros-04"],
      detalle: "El as de espadas es una mata. El 4 de oros es pieza por el palo de la muestra y gana la vuelta." },
    { id: "empatan-los-treses", uso: "repaso", muestra: "copas-06", cartas: ["oros-03", "bastos-03"],
      detalle: "El 3 de oros y el 3 de bastos ocupan el mismo puesto en la jerarquía. Las dos cartas empatan." },
  ],
  pasos: [{ id: "ganadora", tipo: "elegir-cartas", minimo: 1, maximo: 2,
    consigna: "¿Qué carta gana la vuelta?", pista: "Buscá primero las piezas del palo de la muestra. Si ninguna es pieza, compará sus puestos en la escala." }],
};

export const reconocerFlor: Tema = {
  id: "reconocer-flor", habilidad: "reconocer-flor", titulo: "Reconocer flor",
  capitulo: "flor", familias: familiasPorHabilidad["reconocer-flor"],
  resumen: "Mirá si las tres cartas se pueden reunir en un palo.",
  orientacion: "Tres cartas de un palo hacen flor. Cada pieza puede completar cualquier palo. Si tenés una sola pieza, las otras dos deben compartir palo.",
  regla: piezas + " Hay flor con tres cartas del mismo palo. Una pieza puede completar a dos del mismo palo. Con dos o tres piezas siempre hay flor.",
  ejemplos: [
    { id: "tres-copas", uso: "apertura", muestra: "bastos-06", cartas: ["copas-07", "copas-03", "copas-01"],
      detalle: "El 7, el 3 y el as son de copas. Tenés flor porque las tres cartas comparten palo." },
    { id: "dos-oros", uso: "apertura", muestra: "copas-07", cartas: ["oros-01", "oros-06", "espadas-03"],
      detalle: "El as y el 6 son de oros. El 3 de espadas es de otro palo y ninguna carta es pieza. Falta flor." },
    { id: "pieza-y-dos-copas", uso: "repaso", muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "copas-03"],
      detalle: "El 4 de bastos es pieza porque coincide con el palo de la muestra. Puede acompañar al 7 y al 3 de copas para formar flor." },
  ],
  pasos: [{ id: "hay-flor", tipo: "decidir-flor", consigna: "¿Tenés flor en esta mano?",
    pista: "Apartá las piezas. Fijate si todas las cartas que quedan son del mismo palo." }],
};

const reconocerPiezas: Tema = {
  id: "reconocer-piezas", habilidad: "reconocer-piezas", titulo: "Encontrar las piezas",
  capitulo: "jerarquia", familias: familiasPorHabilidad["reconocer-piezas"],
  resumen: "Identificá las piezas y al rey que puede sustituirlas.",
  orientacion: "Buscá el 2, el 4, el 5, el caballo o la sota del palo de la muestra.",
  regla: piezas,
  ejemplos: [
    { id: "dos-cincos", uso: "apertura", muestra: "copas-06", cartas: ["copas-05", "espadas-05", "bastos-07"],
      detalle: "El 5 de copas es pieza porque coincide con el palo de la muestra. El 5 de espadas tiene el mismo número y es de otro palo. El 7 de bastos también conserva su valor común." },
    { id: "dos-cuatros", uso: "apertura", muestra: "bastos-07", cartas: ["oros-04", "espadas-06", "bastos-04"],
      detalle: "Solo el 4 de bastos es pieza. El 4 de oros tiene el mismo número, pero la muestra es de bastos. El 6 de espadas también es una carta común." },
    { id: "rey-sustituto", uso: "repaso", muestra: "copas-04", cartas: ["copas-12", "copas-05", "espadas-04"],
      detalle: "El rey de copas toma el lugar del 4 de copas que está en la mesa. El 5 de copas también es pieza. El 4 de espadas conserva su valor común." },
  ],
  pasos: [{ id: "piezas", tipo: "elegir-cartas", minimo: 0, maximo: 3, consigna: "¿Cuáles son piezas?",
    pista: "Revisá el palo de cada carta y si la muestra le da su lugar al rey." }],
};

const contarEnvido: Tema = {
  id: "contar-envido", habilidad: "contar-envido", titulo: "Contar envido",
  capitulo: "envido", familias: familiasPorHabilidad["contar-envido"],
  resumen: "Elegí las cartas que más suman y calculá sus tantos.",
  orientacion: "El envido se cuenta cuando falta flor. Primero elegís las cartas que dan más tantos. Después decís el total.",
  regla: piezas + " " + figuras + " Con dos comunes de un palo sumás 20 y sus valores. Con tres palos distintos y sin pieza, elegí solo la de mayor valor. Si tenés una pieza, sumá su valor de envido y la mejor de las otras dos. El 2 vale 30, el 4 vale 29, el 5 vale 28 y el caballo y la sota valen 27.",
  ejemplos: [
    { id: "dos-copas", uso: "apertura", muestra: "bastos-06", cartas: ["copas-04", "copas-07", "espadas-01"],
      detalle: "Elegís el 4 y el 7 de copas. Compartir palo te da la base de 20. El as de espadas queda fuera de la cuenta." },
    { id: "dos-oros", uso: "apertura", muestra: "espadas-06", cartas: ["oros-05", "bastos-01", "oros-03"],
      detalle: "El 5 y el 3 de oros suman juntos porque son del mismo palo. El as de bastos queda fuera." },
    { id: "pieza-y-siete", uso: "repaso", muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "espadas-01"],
      detalle: "El valor del 4 de bastos como pieza ya incluye la base. Elegís el 7 de copas porque aporta más que el as de espadas." },
  ],
  pasos: [seleccion, total],
};

const contarFlor: Tema = {
  id: "contar-flor", habilidad: "contar-flor", titulo: "Contar flor",
  capitulo: "flor", familias: familiasPorHabilidad["contar-flor"],
  resumen: "Sumá las tres cartas con una sola base de 20.",
  orientacion: "En la flor cuentan las tres cartas. Empezá con 20, sumá las cartas comunes y agregá lo que cada pieza vale por encima de 20.",
  regla: piezas + " " + figuras + " En la flor cuentan las tres cartas. Sumá 20 una sola vez. Cada pieza aporta lo que pasa de 20 en su valor de envido: el 2 aporta 10, el 4 aporta 9, el 5 aporta 8 y el caballo y la sota aportan 7.",
  ejemplos: [
    { id: "tres-copas", uso: "apertura", muestra: "bastos-06", cartas: ["copas-07", "copas-03", "copas-01"],
      detalle: "El 7, el 3 y el as de copas forman flor. Sumás una sola base de 20 y el valor de cada carta." },
    { id: "tres-oros", uso: "apertura", muestra: "espadas-06", cartas: ["oros-02", "oros-06", "oros-04"],
      detalle: "El 2, el 6 y el 4 de oros forman flor. Como la muestra es de espadas, las tres cartas cuentan por su número." },
    { id: "pieza-y-dos-copas", uso: "repaso", muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "copas-03"],
      detalle: "El 4 de bastos completa la flor con las dos copas. La pieza aporta solo lo que supera los 20 porque ya contaste la base." },
  ],
  pasos: [{ ...seleccion, pista: "Contá las tres cartas de la flor, incluso si alguna aporta cero." }, total],
};

export const temas: readonly Tema[] = [comparar, reconocerFlor, reconocerPiezas, contarEnvido, contarFlor];

export function elegirApertura(tema: Tema, azar = Math.random): Ejemplo {
  const aperturas = tema.ejemplos.filter((ejemplo) => ejemplo.uso === "apertura");
  return aperturas[Math.floor(azar() * aperturas.length)];
}
