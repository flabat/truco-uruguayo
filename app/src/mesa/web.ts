import { Linking } from "react-native";
import { baseDeLaApi } from "../configuracion.ts";
import { esWeb } from "../ingreso/plataforma.ts";

/** Abre una ruta del sitio: en la web en la misma pestaña, en las apps en el navegador. */
export function abrirEnLaWeb(ruta: string) {
  const url = baseDeLaApi.replace(/\/+$/, "") + ruta;
  if (esWeb) globalThis.location.assign(url);
  else void Linking.openURL(url);
}
