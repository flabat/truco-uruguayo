import { destinoDeEnlace, rutaDe } from "../salon/enlaces.ts";

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

/** Dominio asociado a la app (`applinks:` en iOS, `autoVerify` en Android). */
export const dominioApp = "eltru.co";

/**
 * Traduce los enlaces que el sistema abre en la app. Android entrega el retorno del ingreso como un
 * enlace más, y Expo Router buscaría la ruta /ingreso: lo mandamos al inicio, sin el código en la ruta.
 * El canje lo hace `openAuthSessionAsync`, que recibe la misma URL. Los enlaces del sitio
 * (`https://eltru.co/jugar/?invitacion=…`, `/volver/?mesa=…`, `?mirar=…` y las rutas de la exportación
 * web bajo `/app/` o `/jugar/`) van a su pantalla. Los demás enlaces pasan igual.
 */
export function rutaDelSistema(ruta: string): string {
  const sinEsquema = ruta.replace(/^eltruco:/, "").replace(/^\/+/, "");
  if (/^ingreso(?:[/?#]|$)/.test(sinEsquema)) return "/";
  return rutaDeEnlaceWeb(ruta) ?? ruta;
}

/**
 * Pantalla de la app para un enlace del sitio, o `null` si no es un enlace del sitio. Un enlace del
 * dominio que no corresponde a una mesa (o con datos inválidos) abre el inicio: la app no muestra el sitio.
 */
export function rutaDeEnlaceWeb(enlace: string): string | null {
  let url: URL;
  try {
    url = new URL(enlace);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname !== dominioApp) return null;
  const parametros: Record<string, string> = {};
  for (const clave of ["invitacion", "mesa", "mirar"]) {
    const valor = url.searchParams.get(clave);
    if (valor !== null) parametros[clave] = valor;
  }
  const camino = url.pathname;
  let destino = null;
  if (/^\/(?:jugar|app)\/?$/.test(camino)) destino = destinoDeEnlace(parametros);
  else if (/^\/volver\/?$/.test(camino)) destino = destinoDeEnlace({ mesa: parametros.mesa });
  else {
    const profunda = camino.match(/^\/(?:jugar|app)\/(invitacion|sala|mirar)\/([^/]+)\/?$/);
    if (profunda) {
      let valor = "";
      try { valor = decodeURIComponent(profunda[2]); } catch { /* escape inválido: no es un enlace válido */ }
      destino = destinoDeEnlace(profunda[1] === "invitacion" ? { invitacion: valor }
        : profunda[1] === "sala" ? { mesa: valor } : { mirar: valor });
    }
  }
  return destino ? rutaDe(destino) : "/";
}
