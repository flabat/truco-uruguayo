export interface EdicionModelo {
  nombre: string;
  publicado: string | null;
}

const ediciones = new Map<string, EdicionModelo>([
  ["d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3", { nombre: "Ceibo Duelo", publicado: "2026-11-20" }],
  ["6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2", { nombre: "Ceibo Parejas", publicado: "2026-11-20" }],
  ["d2b2293d4d8c9ee4f067ee74c1d6d5983eb5c8ad3a4ebce57bbdb561f946b78b", { nombre: "Ceibo Parejas con señas", publicado: "2026-11-20" }],
  ["incumbent-online-v1", { nombre: "Clásico v1", publicado: "2026-11-19" }],
  ["pie-parejas-v2", { nombre: "Parejas con señas al pie 2", publicado: null }],
  ["pie-clasico-v1", { nombre: "Clásico con señas al pie", publicado: null }],
  ["tercetos-basica-v1", { nombre: "Clásico de tercetos v1", publicado: "2026-11-19" }],
  ["bot-v1", { nombre: "Práctica v1", publicado: "2026-11-18" }],
]);

const nombresPorFormato = new Map([
  ["duel", "Modelo de duelo"],
  ["pairs", "Modelo de parejas"],
  ["pairs-private-senas", "Modelo de parejas con señas"],
  ["pairs-senas", "Modelo de parejas con señas"],
  ["triples", "Modelo de tercetos"],
]);

export function edicionModelo(id: string, formato?: string): EdicionModelo {
  const conocida = ediciones.get(id);
  if (conocida) return conocida;

  const nombre = nombresPorFormato.get(formato ?? "") ?? "Modelo de mesa";
  let referencia = id;
  if (/^[a-f0-9]{64}$/i.test(id)) referencia = id.slice(0, 12);
  else if (id.length > 24) referencia = id.slice(0, 12) + "…" + id.slice(-8);
  return { nombre: `${nombre} · ${referencia}`, publicado: null };
}

const fechaPublicacion = new Intl.DateTimeFormat("es-UY", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

export function fechaModelo(iso: string): string {
  return fechaPublicacion.format(new Date(iso)).replace(".", "");
}
