import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { TapeteLeccion } from "./TapeteLeccion";

export function montarTapete(elemento: HTMLElement) {
  const raiz = createRoot(elemento);
  return (props: ComponentProps<typeof TapeteLeccion>) => raiz.render(<TapeteLeccion {...props} />);
}

export function boton(texto: string, accion: () => void, clase = "button") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = clase;
  el.textContent = texto;
  el.addEventListener("click", accion);
  return el;
}
