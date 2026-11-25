export type Modalidad = "1v1" | "2v2" | "3v3";

/** El lance de tercetos: la redondilla, o un duelo del pico a pico con sus dos asientos activos. */
export type Lance = { tipo: "redondilla" } | { tipo: "pico"; activos: readonly [number, number] };

export interface EntradaMesa {
  /** Tamaño de la pantalla o la ventana, en puntos. */
  ancho: number;
  alto: number;
  modalidad: Modalidad;
  /** Solo en 3v3. Por defecto, redondilla. */
  lance?: Lance;
  /** El asiento de quien juega; null para un espectador, que no tiene mano. */
  propio: number | null;
  /** Para un espectador, el asiento que queda abajo. Por defecto, 0. */
  vistaDesde?: number;
  dador: number;
  mano: number;
  /** Cuántas cartas tiene en la mano cada asiento, de 0 a 3. Un elemento por asiento. */
  cartas: readonly number[];
  /** Una hoja abierta sobre la mesa (Cantos, Mano, Tantos…) con el alto que pide. */
  hoja?: { alto: number } | null;
}

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Una carta: su rectángulo sin rotar y la rotación en grados, horaria, alrededor de su centro. */
export interface Carta extends Rect {
  rotacion: number;
}

export type Lugar =
  | "abajo" | "frente" | "derecha" | "izquierda"
  | "cerca-derecha" | "lejos-derecha" | "lejos-izquierda" | "cerca-izquierda";

/** Completo: nombre, papel y cartas. Círculo: avatar de tercetos. Punto: inactivo en el pico a pico. */
export type Forma = "completo" | "circulo" | "punto";

export interface Punto {
  x: number;
  y: number;
}

export interface GeometriaAsiento {
  asiento: number;
  lugar: Lugar;
  forma: Forma;
  activo: boolean;
  /** Nombre y papel (capa de vistas). Es null solo para el propio jugador con una hoja abierta. */
  rotulo: Rect | null;
  /** Vacío para el propio jugador, que ve su mano, y para los puntos. */
  dorsos: Carta[];
  /** Dónde cae la carta que juega en esta vuelta. Ocupa el mismo lugar que los dorsos. */
  jugada: Carta | null;
  /** Origen de las animaciones de ese asiento: reparto, cartas jugadas, globos. */
  ancla: Punto;
}

export interface Geometria {
  disposicion: "telefono" | "escritorio";
  pantalla: Rect;
  /** La columna de la mesa: toda la pantalla en el teléfono, la central en el escritorio. */
  columna: Rect;
  barra: Rect;
  /** Etiqueta del lance de tercetos («Pico a pico · Duelo 2 de 3»). */
  lance: Rect | null;
  /** El paño: destino del arrastre de una carta. */
  pano: Rect;
  /** Un elemento por asiento, en el orden de los asientos. */
  asientos: GeometriaAsiento[];
  mazo: { muestra: Carta; mazo: Carta; rotulo: Rect };
  estado: Rect;
  /** Las cartas de la mano propia, de izquierda a derecha. Vacío para el espectador. */
  mano: Carta[];
  cantos: Rect | null;
  /** Píldora «Mirando» y «Volver al salón». */
  espectador: Rect | null;
  tira: Rect | null;
  paneles: { izquierdo: Rect; derecho: Rect } | null;
  hoja: Rect | null;
}
