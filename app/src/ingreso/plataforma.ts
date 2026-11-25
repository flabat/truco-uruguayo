// Une la lógica del ingreso con los módulos de Expo. En la web no se guarda nada: manda la cookie.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { crearClienteApp } from "../api/cliente.ts";
import { baseDeLaApi } from "../configuracion.ts";
import { crearAlmacenSesion, type Guardado } from "./almacen.ts";
import { crearPar } from "./pkce.ts";
import { retornoApp } from "./retorno.ts";
import { completarIngreso } from "./sesion.ts";

export const esWeb = Platform.OS === "web";

export const guardadoSeguro: Guardado = {
  leer: clave => SecureStore.getItemAsync(clave),
  guardar: (clave, valor) => SecureStore.setItemAsync(clave, valor),
  borrar: clave => SecureStore.deleteItemAsync(clave),
};

const sinGuardado: Guardado = {
  leer: async () => null,
  guardar: async () => {},
  borrar: async () => {},
};

export const almacen = crearAlmacenSesion(esWeb ? sinGuardado : guardadoSeguro);
export const cliente = crearClienteApp({ base: baseDeLaApi, sesion: almacen.actual });

const sha256 = async (texto: string) =>
  new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(texto)));

/** Abre el ingreso en el navegador del sistema y canjea el retorno. En la web, navega y la cookie hace el resto. */
export async function abrirIngreso() {
  if (esWeb) {
    globalThis.location.assign(cliente.url("/api/auth/login?volver=/app/"));
    return null;
  }
  const { verificador, desafio } = await crearPar(Crypto.getRandomBytes, sha256);
  const resultado = await WebBrowser.openAuthSessionAsync(cliente.url("/api/auth/login?app=" + desafio), retornoApp);
  return completarIngreso({ resultado, verificador, cliente, almacen });
}
