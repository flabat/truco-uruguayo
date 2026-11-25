import { useEffect, useState } from "react";
import { loadData, Skia, type SkImage } from "@shopify/react-native-skia";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { imagenesDeCartas } from "../../cartas/imagenes.ts";

type Id = CardId | "reverso";

// Una sola descarga y decodificación por carta para todo el lienzo: los dorsos que se montan juntos
// comparten la misma solicitud en vuelo, y las cartas que se montan de nuevo reciben la imagen ya lista.
const listas = new Map<Id, SkImage>();
const enVuelo = new Map<Id, Promise<SkImage | null>>();

function cargar(id: Id): Promise<SkImage | null> {
  let solicitud = enVuelo.get(id);
  if (!solicitud) {
    solicitud = loadData(imagenesDeCartas[id], datos => Skia.Image.MakeImageFromEncoded(datos)).then(imagen => {
      if (imagen) listas.set(id, imagen);
      else enVuelo.delete(id);
      return imagen;
    }, () => {
      enVuelo.delete(id);
      return null;
    });
    enVuelo.set(id, solicitud);
  }
  return solicitud;
}

/** La imagen Tatú de una carta (o el reverso), o null mientras carga. */
export function useImagenDeCarta(id: Id): SkImage | null {
  const [imagen, setImagen] = useState<SkImage | null>(() => listas.get(id) ?? null);
  useEffect(() => {
    const lista = listas.get(id);
    if (lista) {
      setImagen(lista);
      return;
    }
    let vigente = true;
    cargar(id).then(cargada => {
      if (vigente) setImagen(cargada);
    });
    return () => {
      vigente = false;
    };
  }, [id]);
  return imagen;
}
