import juego from "../data/juego.json";
import cantos from "../data/cantos.json";
import apendices from "../data/apendices.json";

export interface Source {
  title: string;
  url: string;
}

export interface Table {
  headers: string[];
  rows: string[][];
}

/**
 * Un bloque es un artículo numerado del reglamento, salvo que indique otro tipo.
 * - `ejemplo`: un caso resuelto. Se reúne en el apéndice de casos.
 * - `casa`: cómo aplica la regla la mesa en línea de El Truco. Se reúne en su apéndice.
 * `resumen` suma la tabla del bloque al resumen imprimible.
 */
export interface Block {
  id: string;
  heading: string;
  text: string;
  items?: string[];
  table?: Table;
  kind?: "ejemplo" | "casa";
  resumen?: boolean;
}

export interface Variant {
  id: string;
  title: string;
  text: string;
  table?: Table;
  sources: Source[];
}

export interface Discrepancy {
  tema: string;
  texto: string;
  sources?: Source[];
}

export interface Rule {
  id: string;
  title: string;
  intro: string;
  blocks: Block[];
  sources: Source[];
  variants?: Variant[];
  discrepancias?: Discrepancy[];
}

export const parts = [
  {
    id: "lo-esencial",
    title: "Lo esencial",
    image: "baraja",
    category: "Lo esencial",
    description: "Conocé el juego, prepará la mesa y aprendé qué carta manda según la muestra.",
    ids: ["el-juego", "preparacion", "jerarquia"],
  },
  {
    id: "la-mano",
    title: "La mano",
    image: "mano",
    category: "La mano",
    description: "Seguí el orden de las vueltas, resolvé las pardas y sabé cuándo se canta cada cosa.",
    ids: ["bazas", "orden-de-los-cantos", "irse-al-mazo"],
  },
  {
    id: "los-cantos",
    title: "Los cantos",
    image: "mate",
    category: "Las apuestas",
    description: "Aprendé cuándo tocar envido, cantar flor o gritar truco y cuánto vale cada respuesta.",
    ids: ["envido", "flor", "truco", "perros"],
  },
  {
    id: "el-tanteador",
    title: "El tanteador",
    category: "El tanteador",
    description: "Llevá la cuenta de malas y buenas y calculá la falta y el resto.",
    ids: ["puntaje", "falta-y-resto"],
  },
  {
    id: "la-mesa-de-seis",
    title: "La mesa de seis",
    category: "La mesa de seis",
    description: "Alterná redondillas y duelos de pico a pico entre dos equipos de tres.",
    ids: ["seis-jugadores"],
  },
  {
    id: "la-conducta",
    title: "Conducta en la mesa",
    category: "Conducta",
    description: "Pasá señas a tu compañero, acreditá tus tantos y resolvé los errores.",
    ids: ["senas", "errores", "etiqueta"],
  },
];

/** Las partes con imagen son los temas de la portada. */
export const groups = parts;
export const homeTopics = parts.filter((part) => part.image);

const byId = new Map<string, Rule>(([...juego, ...cantos] as Rule[]).map((rule) => [rule.id, rule]));
export const rules = parts.flatMap((part) =>
  part.ids.map((id) => {
    const rule = byId.get(id);
    if (!rule) throw new Error("Falta el capítulo " + id);
    return rule;
  }),
);
if (byId.size !== rules.length) throw new Error("Hay capítulos sin parte en el índice");

export const partOf = (id: string) => parts.find((part) => part.ids.includes(id))!;
export const chapterNumber = (id: string) => rules.findIndex((rule) => rule.id === id) + 1;

/** Número de cada artículo («7.2»). Los ejemplos y las reglas de la casa no se numeran. */
export function articleNumbers(rule: Rule) {
  const chapter = chapterNumber(rule.id);
  const numbers = new Map<string, string>();
  let n = 0;
  for (const block of rule.blocks) if (!block.kind) numbers.set(block.id, chapter + "." + ++n);
  return numbers;
}

export function url(path = "") {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

export const ruleUrl = (id: string) => url("reglas/" + id + "/");

export const appendices = [
  { letter: "A", id: "variantes", title: "Variantes de mesa", href: url("reglas/variantes/") },
  { letter: "B", id: "en-el-truco", title: "Reglas de El Truco en línea", href: url("reglas/en-el-truco/") },
  { letter: "C", id: "glosario", title: "Glosario", href: url("reglas/glosario/") },
  { letter: "D", id: "resumen", title: "Resumen imprimible", href: url("reglas/resumen/") },
  { letter: "E", id: "casos", title: "Casos resueltos", href: url("reglas/casos/") },
  { letter: "F", id: "fuentes", title: "Fuentes y discrepancias", href: url("fuentes/") },
  { letter: "G", id: "historial", title: "Historial de cambios", href: url("reglas/historial/") },
];
export const appendix = (id: string) => appendices.find((item) => item.id === id)!;

export const glossary = apendices.glosario;
export const changelog = apendices.historial;
export const edition = changelog[0];

const withRule = <T>(pick: (rule: Rule) => T[]) =>
  rules.flatMap((rule) => pick(rule).map((item) => ({ ...item, rule })));

export const variants = withRule((rule) => rule.variants ?? []);
export const houseRules = withRule((rule) => rule.blocks.filter((block) => block.kind === "casa"));
export const examples = withRule((rule) => rule.blocks.filter((block) => block.kind === "ejemplo"));
export const summaryTables = withRule((rule) => rule.blocks.filter((block) => block.resumen && block.table));
export const discrepancies = withRule((rule) => rule.discrepancias ?? []);

export function sourceKey(url: string) {
  return url.split("#")[0];
}

export const bibliography = Array.from(
  rules
    .reduce((books, rule) => {
      const sources = [
        ...rule.sources,
        ...(rule.variants ?? []).flatMap((variant) => variant.sources),
        ...(rule.discrepancias ?? []).flatMap((item) => item.sources ?? []),
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
