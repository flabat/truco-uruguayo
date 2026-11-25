// Lo que cada plantilla le da a `reel.ts`: guion, props, composición, momentos de prueba y borrador de publicación.
import { cartasPorId } from "@eltruco/cliente/cartas.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { resolverManos, resolverVueltas, type Episodio, type EpisodioComparar, type EpisodioTantos } from "../src/lib/episodio.ts";
import type { Linea, LineaGuion } from "../src/lib/linea.ts";
import { guionCompararCartas } from "../src/plantillas/comparar-cartas/guion.ts";
import { guionContarTantos } from "../src/plantillas/contar-tantos/guion.ts";
import { momentosDeComparar, momentosDePrueba } from "./momentos.ts";

export interface Preparacion {
  lineas: LineaGuion[];
  /** Props de la composición, sin la voz. */
  props: Record<string, unknown>;
  composicion: string;
  /** Nombre del MP4 y del SRT. */
  nombre: string;
  /** Línea cuyo primer segundo sirve de portada. */
  portada: string;
  momentos: (L: Linea) => [string, number][];
  publicacion: string;
}

const sinPrefijo = (c: CardId) => cartasPorId.get(c)!.nombre.toLowerCase();

function contarTantos(ep: EpisodioTantos): Preparacion {
  const manos = resolverManos(ep);
  const descripcion = manos.map((m, i) => `Mano ${i + 1}: ${m.cartas.map(sinPrefijo).join(", ")}. Da ${m.tantos.total}.`).join(" ");
  return {
    lineas: guionContarTantos(ep, manos),
    props: { modalidad: ep.modalidad, muestra: ep.muestra, gancho: ep.gancho, manos },
    composicion: "ContarTantos",
    nombre: `Contar ${ep.modalidad} ${ep.id}`,
    portada: "respuesta1",
    momentos: momentosDePrueba,
    publicacion: `# ${ep.serie} ${ep.id}

Borrador para publicar. Revisalo antes de subirlo.

## Texto

${ep.gancho} 🧉

Contá las tres manos antes de que aparezca el resultado.

Probá otra mano en eltru.co/aprender/ #TrucoUruguayo

## Texto alternativo

Lección de ${ep.modalidad} con la muestra ${sinPrefijo(ep.muestra)}. ${descripcion}

## Enlace

https://eltru.co/aprender/
`,
  };
}

function compararCartas(ep: EpisodioComparar): Preparacion {
  const vueltas = resolverVueltas(ep);
  const descripcion = vueltas.map((v, i) => `Vuelta ${i + 1}: ${v.cartas.map(sinPrefijo).join(" contra ")}. ` +
    (v.ganadora === null ? "Parda." : `Gana ${sinPrefijo(v.ganadora)}.`)).join(" ");
  return {
    lineas: guionCompararCartas(ep, vueltas),
    props: { muestra: ep.muestra, gancho: ep.gancho, vueltas },
    composicion: "CompararCartas",
    nombre: `Comparar cartas ${ep.id}`,
    portada: "respuesta1",
    momentos: momentosDeComparar,
    publicacion: `# ${ep.serie} ${ep.id}

Borrador para publicar. Revisalo antes de subirlo.

## Texto

${ep.gancho} 🧉

Decidí cada vuelta antes de que aparezca la ganadora.

Probá otras vueltas en eltru.co/aprender/ #TrucoUruguayo

## Texto alternativo

Lección para comparar dos cartas con la muestra ${sinPrefijo(ep.muestra)}. ${descripcion}

## Enlace

https://eltru.co/aprender/?tema=comparar-cartas
`,
  };
}

export function preparar(ep: Episodio): Preparacion {
  return ep.plantilla === "contar-tantos" ? contarTantos(ep) : compararCartas(ep);
}
