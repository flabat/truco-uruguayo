import { Asset } from "expo-asset";
import { useEffect } from "react";
import { Image, Platform } from "react-native";
import { imagenesDeCartas } from "../cartas/imagenes.ts";
import { crearPrecarga, crearRegistroDePrecarga, type Tarea } from "./precarga.ts";

const registroWeb = crearRegistroDePrecarga();

/**
 * Gancho para la parte 4d: registra la descarga de CanvasKit (unos 3 MB) para que corra en segundo plano
 * junto con las cartas. En las apps Skia ya viene en el binario y la tarea no se usa.
 */
export function registrarPrecargaWeb(tarea: Tarea): void {
  if (Platform.OS === "web") registroWeb.registrar(tarea);
}

const modulos = Object.values(imagenesDeCartas);

function precargarCartas(): Promise<unknown> {
  if (Platform.OS !== "web") return Asset.loadAsync(modulos);
  return Promise.all(modulos.map(modulo => Image.prefetch(Asset.fromModule(modulo).uri)));
}

export const precargarMesa = crearPrecarga(() => [precargarCartas, ...registroWeb.tareas()]);

/** En el salón, la creación de mesa y la sala de espera. Un fallo no molesta: la mesa carga lo que falte. */
export function usePrecargaDeMesa(): void {
  useEffect(() => {
    precargarMesa().catch(() => {});
  }, []);
}
