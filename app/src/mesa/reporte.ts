import { Linking } from "react-native";
import { almacen, cliente, esWeb } from "../ingreso/plataforma.ts";

/**
 * Abre un borrador de reporte en GitHub. En la web envía el mismo formulario que la mesa web a otra
 * pestaña, con la cookie; en las apps lo envía con la sesión y abre la página a la que redirige.
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
  const sesion = almacen.actual();
  const respuesta = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(sesion && { Authorization: "Bearer " + sesion }),
    },
    body: new URLSearchParams(campos).toString(),
  });
  if (!respuesta.ok) throw new Error((await respuesta.text().catch(() => "")) || "No se pudo abrir el reporte.");
  await Linking.openURL(respuesta.url);
}
