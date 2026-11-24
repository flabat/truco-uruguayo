import { paloDe, rangoDe, type CardId, type Rango } from "../../../src/motor/cartas.ts";

const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve"];
const decenas = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

/** Enteros de 0 a 99 como se dicen en el Río de la Plata («treinta y uno»). */
export function aPalabras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new RangeError(`Solo se nombran enteros de 0 a 99: ${n}`);
  if (n < 30) return unidades[n];
  const resto = n % 10;
  return decenas[Math.floor(n / 10)] + (resto ? " y " + unidades[resto] : "");
}

const figuras: Partial<Record<Rango, string>> = { 1: "as", 10: "sota", 11: "caballo", 12: "rey" };

export function palabraDeRango(rango: Rango): string {
  return figuras[rango] ?? unidades[rango];
}

/** "siete de copas", "as de espadas". */
export function nombreHablado(carta: CardId): string {
  return palabraDeRango(rangoDe(carta)) + " de " + paloDe(carta);
}

const porPalabras = new Map(Array.from({ length: 100 }, (_, n) => [aPalabras(n).normalize("NFD").replace(/[̀-ͯ]/g, ""), n]));

/** Los números dichos en un texto ya pasado por `plano`, tomando la frase más larga («treinta y dos», no «treinta»). */
export function numerosDichos(textoPlano: string): { valor: number; dicho: string }[] {
  const palabras = textoPlano.split(" ").filter(Boolean);
  const hallados: { valor: number; dicho: string }[] = [];
  for (let i = 0; i < palabras.length; i++) {
    for (const largo of [3, 1]) {
      const dicho = palabras.slice(i, i + largo).join(" ");
      const valor = porPalabras.get(dicho);
      if (valor !== undefined) { hallados.push({ valor, dicho }); i += largo - 1; break; }
    }
  }
  return hallados;
}
