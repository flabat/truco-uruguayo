/** Conteos anónimos en el registro web: nunca se envían enlaces ni identidades. */
export function contar(evento: "discord" | "compartir-mesa" | "compartir-pagina" | "ingreso-mesa") {
  void fetch(`${import.meta.env.BASE_URL}eventos/${evento}.txt`, { cache: "no-store", keepalive: true, referrerPolicy: "no-referrer" }).catch(() => {});
}
