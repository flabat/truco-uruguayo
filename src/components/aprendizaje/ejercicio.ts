import type { Tema } from "../../aprendizaje/lecciones";
import type { Sesion } from "../../aprendizaje/sesion";
import type { Respuesta } from "../../aprendizaje/tipos";
import { explicarSituacion } from "../../aprendizaje/generadores/evaluacion";
import type { CardId } from "../../motor/cartas";
import { mostrarCarta } from "./cartas";

function boton(texto: string, accion: () => void, clase = "button") {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = clase;
  boton.textContent = texto;
  boton.addEventListener("click", accion);
  return boton;
}

export function montarEjercicio(base: string) {
  const elemento = (id: string) => document.getElementById(id)!;
  const consigna = elemento("consigna");
  const opciones = elemento("opciones");
  const continuacion = elemento("continuacion");
  const cuenta = elemento("cuenta") as HTMLFormElement;
  const tantos = elemento("tantos") as HTMLInputElement;
  const ejemplo = elemento("ejemplo-resuelto");
  const feedback = elemento("feedback");
  const mano = elemento("cartas-mano");

  function preparar(tema: Tema, muestra: CardId) {
    elemento("titulo-practica").textContent = tema.titulo;
    elemento("regla").textContent = tema.regla;
    elemento("capitulo").setAttribute("href", base + "reglas/" + tema.capitulo + "/");
    document.querySelector<HTMLDetailsElement>(".ap-consulta")!.open = false;
    elemento("carta-muestra").replaceChildren(mostrarCarta(base, muestra));
    elemento("rotulo-mano").textContent = tema.comparar ? "Cartas de la vuelta" : "Cartas de la mano";
    limpiar();
  }

  function limpiar() {
    opciones.replaceChildren();
    continuacion.replaceChildren();
    feedback.replaceChildren();
    cuenta.hidden = true;
    ejemplo.hidden = true;
  }

  function mostrarEjemplo(tema: Tema, empezar: () => void) {
    const { muestra, cartas, detalle } = tema.ejemplo;
    preparar(tema, muestra);
    elemento("etapa").textContent = "Ejemplo resuelto";
    consigna.textContent = tema.pasos[0].consigna;
    elemento("instruccion").textContent = "La muestra queda boca arriba y su palo determina las piezas. " + tema.orientacion;
    mano.replaceChildren(...cartas.map((carta) => mostrarCarta(base, carta)));
    ejemplo.hidden = false;
    ejemplo.textContent = detalle;
    // Para las cuentas, mostrar siempre los sumandos y el resultado que devuelve el motor.
    if (tema.pasos.some((paso) => paso.tipo === "responder-total")) {
      const cuentaResuelta = document.createElement("strong");
      cuentaResuelta.textContent = explicarSituacion(tema.habilidad, cartas, muestra);
      ejemplo.prepend(cuentaResuelta);
    }
    continuacion.append(boton("Probar con otra mano", empezar));
    elemento("titulo-practica").focus();
  }

  function practicar(tema: Tema, sesion: Sesion, siguiente: string, continuar: () => void, actualizarAvance: () => void) {
    const { cartas, muestra } = sesion.situacion;
    preparar(tema, muestra);
    let seleccion = new Set<CardId>();

    function responder(respuesta: Respuesta) {
      const intento = sesion.responder(respuesta);
      actualizarAvance();
      if (!intento.correcta) {
        feedback.dataset.estado = "reintentar";
        feedback.textContent = [intento.explicacion, sesion.pista && "Pista · " + sesion.pista].filter(Boolean).join(" ");
        return;
      }
      if (respuesta.tipo === "elegir-cartas") seleccion = new Set(respuesta.cartas);
      mostrarPaso();
      feedback.dataset.estado = "acierto";
      feedback.textContent = "¡Bien! " + intento.explicacion;
    }

    function mostrarPaso() {
      limpiar();
      const paso = sesion.pasoActual;
      elemento("etapa").textContent = paso
        ? `Tu turno · Paso ${tema.pasos.indexOf(paso) + 1} de ${tema.pasos.length}` : "Resultado";
      consigna.textContent = paso?.consigna ?? "Mano resuelta";
      const instruccion = elemento("instruccion");
      instruccion.textContent = "";
      mano.replaceChildren();
      if (paso?.tipo === "elegir-cartas") {
        seleccion = new Set();
        if (tema.comparar) {
          instruccion.textContent = "Elegí la carta más fuerte. Si tienen la misma fuerza, elegí «Empatan».";
          for (const id of cartas) mano.append(mostrarCarta(base, id, () => responder({ tipo: paso.tipo, cartas: [id] })));
          opciones.append(boton("Empatan", () => responder({ tipo: paso.tipo, cartas }), "ap-opcion"));
        } else {
          instruccion.textContent = "Marcá las cartas y confirmá tu selección. Podés tocar una carta otra vez para quitarla.";
          const confirmar = boton("Confirmar cartas", () => responder({ tipo: paso.tipo, cartas: [...seleccion] }));
          confirmar.disabled = true;
          for (const id of cartas) {
            const carta = mostrarCarta(base, id, () => {
              if (seleccion.has(id)) seleccion.delete(id);
              else seleccion.add(id);
              carta.setAttribute("aria-pressed", String(seleccion.has(id)));
              confirmar.disabled = !seleccion.size || seleccion.size < paso.minimo || seleccion.size > paso.maximo;
            });
            carta.setAttribute("aria-pressed", "false");
            mano.append(carta);
          }
          opciones.append(confirmar);
          if (paso.minimo === 0) opciones.append(boton("Ninguna es pieza", () => responder({ tipo: paso.tipo, cartas: [] }), "ap-opcion"));
        }
      } else {
        for (const id of cartas) {
          const carta = mostrarCarta(base, id);
          if (seleccion.has(id)) carta.classList.add("ap-elegida");
          mano.append(carta);
        }
        if (paso?.tipo === "decidir-flor") {
          instruccion.textContent = "Mirá los palos y las piezas antes de decidir.";
          opciones.append(boton("Tengo flor", () => responder({ tipo: paso.tipo, hayFlor: true }), "ap-opcion"),
            boton("Sin flor", () => responder({ tipo: paso.tipo, hayFlor: false }), "ap-opcion"));
        } else if (paso?.tipo === "responder-total") {
          instruccion.textContent = "Sumá los tantos de las cartas que elegiste.";
          cuenta.hidden = false;
          tantos.value = "";
          cuenta.onsubmit = (event) => {
            event.preventDefault();
            if (Number.isSafeInteger(tantos.valueAsNumber)) responder({ tipo: paso.tipo, total: tantos.valueAsNumber });
            else tantos.reportValidity();
          };
        }
      }
      if (paso) {
        continuacion.append(boton("Pedir una pista", () => {
          feedback.dataset.estado = "pista";
          feedback.textContent = "Pista · " + sesion.pedirPista();
        }, "ap-link"));
      } else {
        continuacion.append(boton(siguiente, continuar));
      }
      if (paso?.tipo === "responder-total") tantos.focus();
      else consigna.focus();
    }
    mostrarPaso();
  }

  return { mostrarEjemplo, practicar };
}
