import { familiasPorHabilidad, type Habilidad } from "../generadores/familias.ts";
import type { Leccion, Paso } from "../tipos.ts";
import type { CardId } from "../../motor/cartas.ts";

export interface Tema extends Leccion {
  habilidad: Habilidad;
  resumen: string;
  orientacion: string;
  regla: string;
  ejemplo: { muestra: CardId; cartas: readonly CardId[]; detalle: string };
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
  ejemplo: { muestra: "bastos-06", cartas: ["bastos-02", "espadas-01"],
    detalle: "La muestra es de bastos. El 2 de ese palo es la pieza más fuerte y le gana incluso al as de espadas." },
  pasos: [{ id: "ganadora", tipo: "elegir-cartas", minimo: 1, maximo: 2,
    consigna: "¿Qué carta gana la vuelta?", pista: "Buscá primero las piezas del palo de la muestra. Si ninguna es pieza, compará sus puestos en la escala." }],
};

export const reconocerFlor: Tema = {
  id: "reconocer-flor", habilidad: "reconocer-flor", titulo: "Reconocer flor",
  capitulo: "flor", familias: familiasPorHabilidad["reconocer-flor"],
  resumen: "Mirá si las tres cartas se pueden reunir en un palo.",
  orientacion: "Tres cartas de un palo hacen flor. Cada pieza puede completar cualquier palo. Si tenés una sola pieza, las otras dos deben compartir palo.",
  regla: piezas + " Hay flor con tres cartas del mismo palo. Una pieza puede completar a dos del mismo palo. Con dos o tres piezas siempre hay flor.",
  ejemplo: { muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "copas-03"],
    detalle: "El 4 de bastos es pieza. Puede acompañar al 7 y al 3 de copas para formar flor. Si el 3 fuera de oros, las dos cartas comunes serían de palos distintos y faltaría flor." },
  pasos: [{ id: "hay-flor", tipo: "decidir-flor", consigna: "¿Tenés flor en esta mano?",
    pista: "Apartá las piezas. Fijate si todas las cartas que quedan son del mismo palo." }],
};

const reconocerPiezas: Tema = {
  id: "reconocer-piezas", habilidad: "reconocer-piezas", titulo: "Encontrar las piezas",
  capitulo: "jerarquia", familias: familiasPorHabilidad["reconocer-piezas"],
  resumen: "Identificá las piezas y al rey que puede sustituirlas.",
  orientacion: piezas,
  regla: piezas,
  ejemplo: { muestra: "copas-04", cartas: ["copas-12", "copas-05", "espadas-04"],
    detalle: "El rey de copas toma el lugar del 4 de copas que está en la mesa. El 5 de copas también es pieza. El 4 de espadas conserva su valor común." },
  pasos: [{ id: "piezas", tipo: "elegir-cartas", minimo: 0, maximo: 3, consigna: "¿Cuáles son piezas?",
    pista: "Revisá el palo de cada carta y si la muestra le da su lugar al rey." }],
};

const contarEnvido: Tema = {
  id: "contar-envido", habilidad: "contar-envido", titulo: "Contar envido",
  capitulo: "envido", familias: familiasPorHabilidad["contar-envido"],
  resumen: "Elegí las cartas que más suman y calculá sus tantos.",
  orientacion: "El envido se cuenta cuando falta flor. Primero elegís las cartas que dan más tantos. Después decís el total.",
  regla: piezas + " " + figuras + " Con dos comunes de un palo sumás 20 y sus valores. Con tres palos distintos y sin pieza, elegí solo la de mayor valor. Si tenés una pieza, sumá su valor de envido y la mejor de las otras dos. El 2 vale 30, el 4 vale 29, el 5 vale 28 y el caballo y la sota valen 27.",
  ejemplo: { muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "espadas-01"],
    detalle: "El 4 de bastos aporta 29, con los 20 ya incluidos. Elegís el 7 de copas para llegar a 36. En cambio, con 4 y 7 de copas y as de espadas, contarías las dos copas y su base: 20 + 4 + 7 = 31." },
  pasos: [seleccion, total],
};

const contarFlor: Tema = {
  id: "contar-flor", habilidad: "contar-flor", titulo: "Contar flor",
  capitulo: "flor", familias: familiasPorHabilidad["contar-flor"],
  resumen: "Sumá las tres cartas con una sola base de 20.",
  orientacion: "En la flor cuentan las tres cartas. Empezá con 20, sumá las cartas comunes y agregá lo que cada pieza vale por encima de 20.",
  regla: piezas + " " + figuras + " En la flor cuentan las tres cartas. Sumá 20 una sola vez. Cada pieza aporta lo que pasa de 20 en su valor de envido: el 2 aporta 10, el 4 aporta 9, el 5 aporta 8 y el caballo y la sota aportan 7.",
  ejemplo: { muestra: "bastos-06", cartas: ["bastos-04", "copas-07", "copas-03"],
    detalle: "La pieza completa el palo de las otras dos cartas. El 4 de bastos vale 29 en el envido y aporta 9 en la flor porque ya contaste los 20 de base." },
  pasos: [{ ...seleccion, pista: "Contá las tres cartas de la flor, incluso si alguna aporta cero." }, total],
};

export const temas: readonly Tema[] = [comparar, reconocerFlor, reconocerPiezas, contarEnvido, contarFlor];
