export const retornoApp = "eltruco://ingreso";

/**
 * Código de canje del retorno `eltruco://ingreso?codigo=…`; cualquier otra URL se descarta.
 * El fragmento se ignora: iOS devuelve `…#` cuando la redirección hereda el `#` de una página anterior.
 */
export function codigoDeRetorno(url: string): string | null {
  const prefijo = retornoApp + "?";
  const sinFragmento = url.split("#")[0];
  if (!sinFragmento.startsWith(prefijo)) return null;
  const codigo = new URLSearchParams(sinFragmento.slice(prefijo.length)).get("codigo");
  return codigo !== null && /^[A-Za-z0-9_-]{43}$/.test(codigo) ? codigo : null;
}

/**
 * Traduce los enlaces que el sistema abre en la app. Android entrega el retorno del ingreso como un
 * enlace más, y Expo Router buscaría la ruta /ingreso: lo mandamos al inicio, sin el código en la ruta.
 * El canje lo hace `openAuthSessionAsync`, que recibe la misma URL. Los demás enlaces pasan igual.
 */
export function rutaDelSistema(ruta: string): string {
  const sinEsquema = ruta.replace(/^eltruco:/, "").replace(/^\/+/, "");
  return /^ingreso(?:[/?#]|$)/.test(sinEsquema) ? "/" : ruta;
}
