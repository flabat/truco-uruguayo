import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const svgNamespace = "http://www.w3.org/2000/svg";
const parser = new DOMParser({
  onError(level, message) { throw new Error(message); },
});
const serializer = new XMLSerializer();

function parse(source) {
  const doc = parser.parseFromString(source, "image/svg+xml");
  if (doc.documentElement.localName !== "svg" || doc.documentElement.namespaceURI !== svgNamespace)
    throw new Error("Se esperaba un documento SVG.");
  return doc;
}

function elements(root) {
  return [root, ...Array.from(root.getElementsByTagName("*"))];
}

function indexIds(root) {
  const ids = new Map();
  for (const el of elements(root)) {
    const id = el.getAttribute("id");
    if (!id) continue;
    if (ids.has(id)) throw new Error("ID duplicado: " + id);
    ids.set(id, el);
  }
  return ids;
}

// Reescribir enlaces de <use>, rellenos, trazos, recortes y estilos.
function rewrite(root, resolve) {
  function css(value) {
    return value.replace(/url\(\s*(['"]?)([^)'"]+?)\1\s*\)/g, (_, quote, ref) =>
      "url(" + resolve(ref.trim()) + ")");
  }
  for (const el of elements(root)) {
    if (el.localName === "image") throw new Error("La fuente debe contener dibujo vectorial.");
    if (el.localName === "style") el.textContent = css(el.textContent);
    for (const attr of Array.from(el.attributes)) {
      let value = attr.value;
      if (attr.localName === "href") value = resolve(value);
      else if (value.includes("url(")) value = css(value);
      if (value !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, value);
    }
  }
}

export function loadLibrary(source) {
  return indexIds(parse(source).documentElement);
}

// Incluir solo los componentes utilizados. Así una edición de marco afecta a su palo.
export function standalone(source, library) {
  const doc = parse(source);
  const root = doc.documentElement;
  const local = indexIds(root);
  const needed = new Set();
  const copies = new Map();
  const prefix = "tatu-comun-";
  const shared = (id) => {
    if (!library.has(id)) throw new Error("Falta comun.svg#" + id);
    needed.add(id);
    return "#" + prefix + id;
  };
  rewrite(root, (ref) => {
    if (ref.startsWith("comun.svg#")) return shared(ref.slice("comun.svg#".length));
    if (ref.startsWith("#") && local.has(ref.slice(1))) return ref;
    throw new Error("Referencia sin resolver: " + ref);
  });
  for (const id of needed) {
    const copy = doc.importNode(library.get(id), true);
    for (const el of elements(copy)) {
      if (!el.hasAttribute("id")) continue;
      const target = prefix + el.getAttribute("id");
      if (local.has(target)) throw new Error("ID reservado: " + target);
      el.setAttribute("id", target);
    }
    rewrite(copy, (ref) => {
      if (!ref.startsWith("#")) throw new Error("Referencia no local en comun.svg: " + ref);
      return shared(ref.slice(1));
    });
    copies.set(id, copy);
  }
  const defs = doc.createElementNS(svgNamespace, "defs");
  for (const [id, copy] of copies) {
    // Un hijo referenciado también puede estar incluido dentro de un grupo importado.
    let ancestor = library.get(id).parentElement;
    while (ancestor && !needed.has(ancestor.getAttribute("id"))) ancestor = ancestor.parentElement;
    if (!ancestor) defs.appendChild(copy);
  }
  root.insertBefore(defs, root.firstChild);
  return serializer.serializeToString(root);
}
