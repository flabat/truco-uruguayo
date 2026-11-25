import juego from "../data/juego.json";
import cantos from "../data/cantos.json";

export interface Source {
  title: string;
  url: string;
}

export interface Rule {
  id: string;
  title: string;
  intro: string;
  blocks: {
    id?: string;
    heading: string;
    text: string;
    items?: string[];
    table?: { headers: string[]; rows: string[][] };
  }[];
  sources: Source[];
  variants?: { title: string; text: string; sources: Source[] }[];
}

export const groups = [
  {
    id: "las-cartas",
    title: "Las cartas",
    image: "baraja",
    category: "La baraja",
    description: "Conocé los palos, la muestra y las cinco piezas que mandan en cada mano.",
    ids: ["preparacion", "jerarquia"],
  },
  {
    id: "la-partida",
    title: "La partida",
    image: "mano",
    category: "El juego",
    description: "Seguí el orden de las vueltas, resolvé las pardas y llevá la cuenta de los tantos.",
    ids: ["bazas", "puntaje", "seis-jugadores", "senas"],
  },
  {
    id: "los-cantos",
    title: "Los cantos",
    image: "mate",
    category: "Las apuestas",
    description: "Aprendé cuándo tocar envido, cantar flor o gritar truco y cuánto vale cada respuesta.",
    ids: ["envido", "flor", "truco"],
  },
];

const byId = new Map<string, Rule>([...juego, ...cantos].map((rule) => [rule.id, rule]));
export const rules = groups.flatMap((group) =>
  group.ids.map((id) => {
    const rule = byId.get(id);
    if (!rule) throw new Error("Falta el capítulo " + id);
    return rule;
  }),
);

export function url(path = "") {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

export const ruleUrl = (id: string) => url("reglas/" + id + "/");
export const variants = rules.flatMap((rule) =>
  (rule.variants ?? []).map((variant) => ({
    ...variant,
    rule,
  })),
);

export function sourceKey(url: string) {
  return url.split("#")[0];
}

export const bibliography = Array.from(
  rules
    .reduce((books, rule) => {
      const sources = [
        ...rule.sources,
        ...(rule.variants ?? []).flatMap((variant) => variant.sources),
      ];
      for (const source of sources) {
        const key = sourceKey(source.url);
        if (!books.has(key)) books.set(key, { source, chapters: new Map<string, Rule>() });
        books.get(key)!.chapters.set(rule.id, rule);
      }
      return books;
    }, new Map<string, { source: Source; chapters: Map<string, Rule> }>())
    .values(),
);
