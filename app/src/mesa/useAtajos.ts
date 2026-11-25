import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { atajoDeTecla, escribiendo, type Atajo, type EstadoDeAtajos } from "./atajos.ts";

const destinoDe = (destino: EventTarget | null) => destino instanceof HTMLElement
  ? { tagName: destino.tagName, isContentEditable: destino.isContentEditable, type: destino instanceof HTMLInputElement ? destino.type : undefined }
  : null;

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
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.defaultPrevented || escribiendo(destinoDe(e.target))) return;
      const atajo = atajoDeTecla(e.key, ultimo.current.estado);
      if (!atajo) return;
      e.preventDefault();
      ultimo.current.aplicar(atajo);
    };
    document.addEventListener("keydown", alApretar);
    return () => document.removeEventListener("keydown", alApretar);
  }, []);
}
