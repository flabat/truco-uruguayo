import type { Ejemplo } from "../../aprendizaje/lecciones";
import { explicarSituacion } from "../../aprendizaje/generadores/evaluacion";
import { paloDe } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";

/** Ilustra la elección en las cartas ya repartidas, sin abrir una sesión de práctica. */
export function demostrarComparacion(
  { muestra, cartas }: Ejemplo, cartasVisibles: HTMLElement[], solucion: HTMLElement,
) {
  const mesa = document.querySelector<HTMLElement>(".ap-mesa")!;
  const panel = mesa.closest<HTMLElement>(".ap-ejercicio")!;
  const repetir = document.querySelector<HTMLButtonElement>("#repetir-demostracion")!;
  const orden = compararCartas(cartas[0], cartas[1], muestra);
  const empate = document.getElementById("empate-demostracion")!;
  empate.hidden = orden !== 0;
  const objetivo = orden === 0 ? empate : cartasVisibles[orden > 0 ? 0 : 1];
  const eleccion = `Elegís «${objetivo.textContent}».`;
  const plantilla = document.querySelector<HTMLTemplateElement>("#gesto-demostracion")!;
  objetivo.append(plantilla.content.cloneNode(true));
  const indicacion = document.createElement("strong");
  const motivo = document.createElement("span");
  motivo.textContent = explicarSituacion("comparar-cartas", cartas, muestra);
  solucion.replaceChildren(indicacion, motivo);
  solucion.setAttribute("aria-live", "polite");
  solucion.setAttribute("aria-atomic", "true");
  const preferencia = matchMedia("(prefers-reduced-motion: reduce)");
  const eventos = new AbortController();
  let observador: IntersectionObserver | undefined;
  let temporizador: number | undefined;

  function detener() {
    observador?.disconnect();
    window.clearTimeout(temporizador);
  }

  function resolver() {
    detener();
    panel.dataset.demostracion = "resultado";
    objetivo.classList.add("ap-elegida");
    indicacion.textContent = eleccion;
  }

  function reproducir() {
    detener();
    if (preferencia.matches) {
      resolver();
      return;
    }
    objetivo.classList.remove("ap-elegida");
    panel.dataset.demostracion = "muestra";
    indicacion.textContent = `Primero, mirá la muestra de ${paloDe(muestra)}.`;
    temporizador = window.setTimeout(() => {
      panel.dataset.demostracion = "eleccion";
      indicacion.textContent = eleccion;
      temporizador = window.setTimeout(resolver, 1100);
    }, 1400);
  }

  repetir.hidden = false;
  repetir.addEventListener("click", () => {
    mesa.scrollIntoView({ block: "nearest", behavior: "instant" });
    reproducir();
  }, { signal: eventos.signal });
  preferencia.addEventListener("change", () => { if (preferencia.matches) resolver(); }, { signal: eventos.signal });
  window.addEventListener("pagehide", resolver, { signal: eventos.signal });
  window.addEventListener("popstate", resolver, { signal: eventos.signal });
  if (preferencia.matches || !("IntersectionObserver" in window)) {
    resolver();
  } else {
    panel.dataset.demostracion = "espera";
    observador = new IntersectionObserver(([entrada]) => {
      if (!eventos.signal.aborted && panel.dataset.demostracion === "espera" && entrada.intersectionRatio >= 0.9) reproducir();
    }, { threshold: 0.9 });
    observador.observe(mesa);
  }

  return () => {
    detener();
    eventos.abort();
    repetir.hidden = true;
    empate.hidden = true;
    delete panel.dataset.demostracion;
    objetivo.classList.remove("ap-elegida");
    objetivo.querySelector(".ap-gesto")?.remove();
    solucion.removeAttribute("aria-live");
    solucion.removeAttribute("aria-atomic");
  };
}
