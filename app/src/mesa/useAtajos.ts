import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { atajoDeTecla, type Atajo, type EstadoDeAtajos } from "./atajos.ts";

function escribiendo(destino: EventTarget | null) {
  if (!(destino instanceof HTMLElement)) return false;
  return destino.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName);
}

/**
 * Los atajos de teclado de la mesa. Solo en la web: React Native Web no tiene teclado propio, así
 * que se escucha `keydown` en `document`. Mayúsculas cuenta como la misma letra (C o c); Control,
 * Alt y Comando no, para no pisar los atajos del navegador. Mantener apretada una tecla no repite.
 */
export function useAtajos(aplicar: (a: Atajo) => void, estado: EstadoDeAtajos) {
  const ultimo = useRef({ aplicar, estado });
  useEffect(() => {
    ultimo.current = { aplicar, estado };
  });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const alApretar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.defaultPrevented || escribiendo(e.target)) return;
      const atajo = atajoDeTecla(e.key, ultimo.current.estado);
      if (!atajo) return;
      e.preventDefault();
      ultimo.current.aplicar(atajo);
    };
    document.addEventListener("keydown", alApretar);
    return () => document.removeEventListener("keydown", alApretar);
  }, []);
}
