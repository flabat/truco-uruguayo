import type { Linea } from "../src/lib/linea.ts";

/** Los momentos de la hoja de prueba, solo de las líneas que están en el guion, ordenados por tiempo. */
export function momentosDePrueba(L: Linea): [string, number][] {
  const hay = (id: string) => L.tramos.some((t) => t.id === id);
  const lista: [string, number][] = [];
  if (hay("pregunta")) lista.push(["pregunta", L.inicio("pregunta") + 1]);
  if (hay("cartas")) lista.push(["cartas", L.fin("cartas") - 0.3]);
  L.pausas.forEach((p) => lista.push([`pausa ${p.id}`, p.desde + 1]));
  for (const id of ["respuesta1", "respuesta2", "respuesta3"]) if (hay(id)) lista.push([id, L.inicio(id) + 1]);
  if (hay("cambio")) lista.push(["cambio", L.fin("cambio") - 0.2]);
  if (hay("tercera")) lista.push(["tercera", L.fin("tercera") - 0.3]);
  if (hay("valores")) lista.push(["valores", L.inicio("valores") + 1]);
  if (hay("cierre")) lista.push(["cierre", L.inicio("cierre") + 0.6]);
  return lista.sort((a, b) => a[1] - b[1]).slice(0, 10);
}

/** Para comparar cartas: cada vuelta con sus cartas y su resultado, la escala y el cierre. */
export function momentosDeComparar(L: Linea): [string, number][] {
  const hay = (id: string) => L.tramos.some((t) => t.id === id);
  const lista: [string, number][] = [];
  if (hay("pregunta")) lista.push(["pregunta", L.inicio("pregunta") + 1]);
  for (let n = 1; hay(`vuelta${n}`) || hay(`respuesta${n}`); n++) {
    if (hay(`vuelta${n}`)) lista.push([`vuelta${n}`, L.fin(`vuelta${n}`) - 0.3]);
    if (hay(`respuesta${n}`)) lista.push([`respuesta${n}`, L.inicio(`respuesta${n}`) + 1]);
  }
  const primera = L.pausas[0];
  if (primera && lista.length < 9) lista.push([`pausa ${primera.id}`, primera.desde + 1.5]);
  if (hay("escala")) lista.push(["escala", L.inicio("escala") + 1.5]);
  if (hay("cierre")) lista.push(["cierre", L.inicio("cierre") + 0.6]);
  return lista.sort((a, b) => a[1] - b[1]).slice(0, 10);
}
