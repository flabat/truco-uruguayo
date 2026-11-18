import type { VistaAsiento } from "../../motor/mano";
import { textosProbabilidad } from "../../aprendizaje/probabilidad/escenas";
import { crearClienteAnalisis, type EstadoConsulta } from "../../probabilidad/cliente";
import { posicionPublica, type PosicionPublicaV1 } from "../../probabilidad/informacion";
import { contrastarCartas, motivoSinCifras, presentarResultado } from "../probabilidad/presentacion";

export function montarConsultaChances(raiz: HTMLElement) {
  const cliente = crearClienteAnalisis();
  const abrir = raiz.querySelector<HTMLButtonElement>("#comparar-mis-cartas")!;
  const panel = raiz.querySelector<HTMLElement>("#panel-chances")!;
  const estado = raiz.querySelector<HTMLElement>("#estado-chances")!;
  const contenido = raiz.querySelector<HTMLElement>("#resultado-chances")!;
  const metodo = raiz.querySelector<HTMLElement>("#metodo-chances")!;
  const explicacion = raiz.querySelector<HTMLElement>("#explicacion-chances")!;
  const tabla = contenido.querySelector("tbody")!;
  const diferencias = contenido.querySelector<HTMLDetailsElement>("details")!;
  const lista = diferencias.querySelector("ul")!;
  const reintentar = raiz.querySelector<HTMLButtonElement>("#reintentar-chances")!;
  let posicion: PosicionPublicaV1 | null = null;

  function cerrar() {
    cliente.cancelar();
    abrir.setAttribute("aria-expanded", "false");
    abrir.textContent = "Comparar mis cartas";
    panel.hidden = true;
    contenido.hidden = true;
    reintentar.hidden = true;
    diferencias.open = false;
    estado.textContent = "";
    tabla.replaceChildren();
    lista.replaceChildren();
  }

  function recibir(actualizacion: EstadoConsulta) {
    if (actualizacion.tipo === "calculando") {
      // El worker emite avances por lote. Anunciar una sola vez mientras se calcula.
      if (!estado.textContent) estado.textContent = "Calculando las chances de tu pareja…";
      return;
    }
    if (actualizacion.tipo === "error") {
      estado.textContent = "No pudimos calcular estas chances. Podés volver a calcular o seguir jugando.";
      reintentar.hidden = false;
      return;
    }
    const { resultado, origen } = actualizacion;
    if (resultado.tipo !== "completo") {
      estado.textContent = motivoSinCifras(resultado.tipo);
      reintentar.hidden = resultado.tipo !== "presupuesto-agotado";
      return;
    }
    const vista = presentarResultado(resultado, origen);
    metodo.textContent = [vista.metodo, vista.denominador].join(" · ");
    for (const fila of vista.filas) {
      const tr = tabla.insertRow();
      const nombre = document.createElement("th");
      nombre.scope = "row";
      nombre.textContent = fila.nombre;
      tr.append(nombre);
      tr.insertCell().textContent = fila.porcentaje;
      tr.insertCell().textContent = fila.victorias;
    }
    for (const { a, b } of resultado.pares) {
      const li = document.createElement("li");
      li.textContent = contrastarCartas(resultado, a, b);
      lista.append(li);
    }
    explicacion.textContent = resultado.metodo === "exacto" ? textosProbabilidad.exacto : textosProbabilidad.estimacion;
    lista.hidden = !resultado.pares.length;
    contenido.hidden = false;
    estado.textContent = vista.lectura;
  }

  function consultar() {
    if (!posicion) return;
    panel.hidden = false;
    abrir.setAttribute("aria-expanded", "true");
    abrir.textContent = "Cerrar comparación";
    reintentar.hidden = true;
    estado.textContent = "";
    cliente.consultar(posicion, recibir);
  }

  abrir.addEventListener("click", () => {
    if (panel.hidden) consultar();
    else cerrar();
  });
  reintentar.addEventListener("click", () => {
    abrir.focus();
    consultar();
  });
  window.addEventListener("pagehide", cerrar);
  return {
    mostrarTurno(mesa: VistaAsiento | null) {
      cerrar();
      posicion = mesa ? posicionPublica(mesa) : null;
      raiz.hidden = !posicion;
    },
  };
}
