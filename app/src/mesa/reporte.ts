import { Linking } from "react-native";
import { almacen, cliente, esWeb } from "../ingreso/plataforma.ts";
import { enlaceDeReporte } from "./reporte-campos.ts";

/**
 * Abre un borrador de reporte en GitHub. En la web envía el mismo formulario que la mesa web a otra
 * pestaña, con la cookie; en las apps lo envía con la sesión y abre el enlace que devuelve.
 */
export async function reportarJugada(mesaId: string, campos: Record<string, string>) {
  const url = cliente.url("/api/mesas/" + encodeURIComponent(mesaId) + "/reportes");
  if (esWeb) {
    const formulario = document.createElement("form");
    Object.assign(formulario, { action: url, method: "post", target: "_blank", rel: "noopener" });
    for (const [name, value] of Object.entries(campos)) {
      formulario.append(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
    }
    document.body.append(formulario);
    formulario.submit();
    formulario.remove();
    return;
  }
  // Con `Accept: application/json` el servidor devuelve el enlace en vez de redirigir: la sesión
  // nunca viaja en una redirección hacia GitHub.
  const sesion = almacen.actual();
  const respuesta = await fetch(url, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...(sesion && { Authorization: "Bearer " + sesion }),
    },
    body: new URLSearchParams(campos).toString(),
  });
  if (!respuesta.ok) throw new Error((await respuesta.text().catch(() => "")) || "No se pudo abrir el reporte.");
  const enlace = enlaceDeReporte(await respuesta.json(), respuesta.redirected);
  if (!enlace) throw new Error("No se pudo abrir el reporte.");
  await Linking.openURL(enlace);
}
