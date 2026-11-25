import { Linking } from "react-native";
import { baseDeLaApi } from "../configuracion.ts";
import { esWeb } from "../ingreso/plataforma.ts";

/** Abre una ruta del sitio: en la web en la misma pestaña, en las apps en el navegador. */
export function abrirEnLaWeb(ruta: string) {
  const url = baseDeLaApi.replace(/\/+$/, "") + ruta;
  if (esWeb) globalThis.location.assign(url);
  else void Linking.openURL(url);
}

/** Abre un enlace sin dejar la mesa: en la web en otra pestaña, en las apps en el navegador. */
export function abrirAparte(url: string) {
  if (esWeb) globalThis.open(url, "_blank", "noopener,noreferrer");
  else void Linking.openURL(url);
}
