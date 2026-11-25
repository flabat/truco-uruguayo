import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { clavePreferencias, leerPreferencias, livianoActivo, porDefecto, type Preferencias } from "./preferencias.ts";

/** Sonido, hápticos y modo liviano de la mesa, recordados en el dispositivo. */
export function usePreferencias() {
  const [preferencias, guardar] = useState<Preferencias>(porDefecto);
  // Hasta leer lo guardado, `preferencias` son las de fábrica: no se enciende el sonido ni los hápticos.
  const [cargadas, marcarCargadas] = useState(false);
  const reducirMovimiento = useReducirMovimiento();
  // Si se toca un interruptor antes de que termine la lectura, gana lo que se tocó.
  const tocadas = useRef(false);

  useEffect(() => {
    let vigente = true;
    AsyncStorage.getItem(clavePreferencias).then(
      texto => {
        if (!vigente) return;
        if (!tocadas.current) guardar(leerPreferencias(texto));
        marcarCargadas(true);
      },
      () => { if (vigente) marcarCargadas(true); },
    );
    return () => { vigente = false; };
  }, []);

  const cambiar = useCallback((clave: keyof Preferencias, valor: boolean) => {
    tocadas.current = true;
    marcarCargadas(true);
    guardar(actuales => {
      const nuevas = { ...actuales, [clave]: valor };
      void AsyncStorage.setItem(clavePreferencias, JSON.stringify(nuevas)).catch(() => {});
      return nuevas;
    });
  }, []);

  return { preferencias, cargadas, cambiar, reducirMovimiento, liviano: livianoActivo(preferencias, reducirMovimiento) };
}

/**
 * «Reducir movimiento» del sistema, en vivo. `useReducedMotion` de Reanimated se lee una sola vez al
 * cargar: sirve de valor inicial. En la web, react-native-web responde con `prefers-reduced-motion`.
 */
function useReducirMovimiento() {
  const [reducir, cambiarReducir] = useState(useReducedMotion());
  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (vigente) cambiarReducir(v); }, () => {});
    const suscripcion = AccessibilityInfo.addEventListener("reduceMotionChanged", v => cambiarReducir(v));
    return () => {
      vigente = false;
      suscripcion?.remove();
    };
  }, []);
  return reducir;
}
