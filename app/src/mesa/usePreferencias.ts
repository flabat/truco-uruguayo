import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { clavePreferencias, leerPreferencias, livianoActivo, porDefecto, type Preferencias } from "./preferencias.ts";

/** Sonido, hápticos y modo liviano de la mesa, recordados en el dispositivo. */
export function usePreferencias() {
  const [preferencias, guardar] = useState<Preferencias>(porDefecto);
  const reducirMovimiento = useReducedMotion();
  // Si se toca un interruptor antes de que termine la lectura, gana lo que se tocó.
  const tocadas = useRef(false);

  useEffect(() => {
    let vigente = true;
    AsyncStorage.getItem(clavePreferencias).then(
      texto => { if (vigente && !tocadas.current) guardar(leerPreferencias(texto)); },
      () => {},
    );
    return () => { vigente = false; };
  }, []);

  const cambiar = useCallback((clave: keyof Preferencias, valor: boolean) => {
    tocadas.current = true;
    guardar(actuales => {
      const nuevas = { ...actuales, [clave]: valor };
      void AsyncStorage.setItem(clavePreferencias, JSON.stringify(nuevas)).catch(() => {});
      return nuevas;
    });
  }, []);

  return { preferencias, cambiar, reducirMovimiento, liviano: livianoActivo(preferencias, reducirMovimiento) };
}
