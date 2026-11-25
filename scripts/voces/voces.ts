// Una voz por asiento, de la biblioteca compartida de ElevenLabs, todas con acento rioplatense.
// Se alternan mujeres y hombres para que dos asientos vecinos nunca suenen parecido.

export interface VozDeAsiento {
  asiento: number;
  nombre: string;
  id: string;
  caracter: string;
}

export const voces: readonly VozDeAsiento[] = [
  { asiento: 0, nombre: "Tomás", id: "QK4xDwo9ESPHA4JNUpX3", caracter: "hombre joven, Argentina y Uruguay" },
  { asiento: 1, nombre: "Sofía", id: "h60rOzgfLmYsntfqgGu2", caracter: "mujer adulta, cálida" },
  { asiento: 2, nombre: "Patricio", id: "8cQzlh6lShmndqJg4Yxw", caracter: "hombre adulto, algo ronco" },
  { asiento: 3, nombre: "Cande", id: "yFykvY9iSJewrANOC0cU", caracter: "mujer joven de Buenos Aires" },
  { asiento: 4, nombre: "Juanma", id: "N6aRe3hk1YqaHDtQpTAH", caracter: "hombre de voz grave" },
  { asiento: 5, nombre: "Nieve", id: "nAFxIJGj7iSTeltygOfB", caracter: "mujer mayor" },
];

export const modelo = "eleven_v4";
/** El plan de ElevenLabs solo acepta MP3 de 128 kbps. */
export const formatoPedido = "mp3_44100_128";
export const semilla = 7;

/**
 * Clips regrabados con otra semilla porque la transcripción de control no decía el texto.
 * Clave: «asiento/clave».
 */
export const retomas: Readonly<Record<string, number>> = {
  "0/retruco": 11,
  "2/pie-juga": 11,
};
