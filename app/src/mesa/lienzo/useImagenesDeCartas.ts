import { useImage, type SkImage } from "@shopify/react-native-skia";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { imagenesDeCartas } from "../../cartas/imagenes.ts";

// Una imagen decodificada por carta para todo el lienzo: los dorsos y las cartas que se montan de nuevo
// no vuelven a bajar ni a decodificar la misma imagen.
const decodificadas = new Map<CardId | "reverso", SkImage>();

/** La imagen Tatú de una carta (o el reverso), o null mientras carga. */
export function useImagenDeCarta(id: CardId | "reverso"): SkImage | null {
  const guardada = decodificadas.get(id);
  const cargada = useImage(guardada ? null : imagenesDeCartas[id]);
  if (guardada) return guardada;
  if (cargada) decodificadas.set(id, cargada);
  return cargada;
}
