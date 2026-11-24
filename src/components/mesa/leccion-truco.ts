import { crearLeccionTruco } from "../../aprendizaje/leccion-truco";
import type { AccionTruco } from "@eltruco/motor/truco.ts";
import { createElement } from "react";
import { CartaEnLeccion } from "./TapeteLeccion";
import { asientos, nombre, pareja, resultadoMano, situacionDeJuego } from "./relato";
import { boton, montarTapete } from "./tapete";

function relatar(accion: AccionTruco) {
  const quien = asientos[accion.asiento];
  if (accion.tipo === "carta") return quien + (accion.asiento === 0 ? " jugaste " : " jugó ") + nombre(accion.carta) + ".";
  const canto = { truco: "Truco", quiero: "Quiero", "no-quiero": "No quiero" }[accion.tipo];
  return quien + (accion.asiento === 0 ? " dijiste " : " dijo ") + "«" + canto + "».";
}

export function montarLeccionTruco() {
  const base = document.querySelector<HTMLElement>(".guiada")!.dataset.base!;
  const juego = crearLeccionTruco();
  const el = (id: string) => document.getElementById(id)!;
  const pregunta = el("pregunta");
  const guia = el("guia-turno");
  const controles = el("decisiones");
  const mostrarTapete = montarTapete(el("mesa-tapete"));

  function actuar(accion: AccionTruco) {
    if (juego.actuar(accion)) pintar(true);
  }
  function repetir(modo: Parameters<typeof juego.repetir>[0]) {
    juego.repetir(modo);
    pintar(true);
  }
  function reproducir(posicion: number | null) {
    juego.reproducir(posicion);
    pintar(true);
  }

  function pintar(enfocar = false) {
    const { mesa, apuesta, resultado, acciones, cursor, total, envido } = juego.vista();
    const ultima = acciones.at(-1);
    const pendiente = apuesta === "pendiente";
    const enJuego = cursor === null && !resultado && !pendiente;
    const aviso = resultado ? "Mano cerrada" : pendiente ? "Falta responder al truco" : undefined;
    const cobrar = resultado && pareja(resultado.equipo) + (resultado.tantos === 1 ? " cobra 1 tanto" : " cobra 2 tantos");
    const motivo = resultado?.motivo === "rechazo" ? "El no quiero cierra la mano. Cobra la pareja que cantó."
      : resultado ? resultadoMano(mesa) + (apuesta === "querido" ? " El truco estaba querido." : " La mano se jugó sin cantar.") : "";
    controles.replaceChildren();
    el("envido-cobrado").textContent = "Antes de la salida, " + pareja(envido.equipo).toLowerCase() + " cobró el envido con " + envido.total + ".";
    const lista = el("acciones-truco");
    lista.replaceChildren(...acciones.map((accion) => {
      const item = document.createElement("li");
      item.textContent = relatar(accion);
      return item;
    }));
    mostrarTapete({
      base, mesa, finDeVuelta: cursor !== null && ultima?.tipo === "carta", anuncio: aviso, etiquetaCartas: "Tus cartas",
      cartas: mesa.cartas.map(carta => createElement(CartaEnLeccion, {
        key: carta, base, carta, jugar: enJuego,
        elegir: enJuego ? () => actuar({ tipo: "carta", asiento: 0, carta }) : undefined,
      })),
    });

    const momento = el("momento");
    if (cursor !== null) {
      momento.textContent = "Reproducción";
      pregunta.textContent = "Acción " + cursor + " de " + total;
      guia.textContent = (ultima ? relatar(ultima) : "Así empezó la mano.") + " " +
        (resultado ? cobrar + ". " + motivo : pendiente ? "La pareja rival del cantor tiene la palabra." :
          ultima?.tipo === "quiero" ? "Se juega por 2. Conserva el turno de carta quien cantó." : "");
      const anterior = boton("Anterior", () => reproducir(cursor - 1), "ap-opcion");
      anterior.disabled = cursor === 0;
      controles.append(anterior);
      if (cursor < total) controles.append(boton("Siguiente acción", () => reproducir(cursor + 1)));
      controles.append(boton("Volver al resultado", () => reproducir(null), "ap-link"));
    } else if (resultado) {
      momento.textContent = "Resultado del truco";
      pregunta.textContent = cobrar;
      guia.textContent = motivo;
      controles.append(boton("Repartir de nuevo", () => repetir("otro-reparto")),
        boton("Repetir el ejemplo", () => repetir("ejemplo"), "ap-opcion"),
        boton("Reproducir la mano", () => reproducir(0), "ap-opcion"));
    } else if (pendiente) {
      momento.textContent = "La palabra es tuya";
      pregunta.textContent = "Te cantaron truco. ¿Querés?";
      guia.textContent = "El rival de la derecha espera tu respuesta. Si querés, él sale y quien gane cobra 2. Si decís «no quiero», su pareja cobra 1 ahora.";
      controles.append(boton("Quiero", () => actuar({ tipo: "quiero", asiento: 0 })),
        boton("No quiero", () => actuar({ tipo: "no-quiero", asiento: 0 }), "ap-opcion"));
    } else {
      const querida = apuesta === "querido";
      momento.textContent = "Vuelta " + (mesa.vueltas.length + 1) + (querida ? " · 2 tantos en juego" : " · 1 tanto en juego");
      pregunta.textContent = querida ? "¿Qué carta jugás?" : "¿Cantás truco o jugás una carta?";
      if (querida) {
        let reanudacion = "";
        if (ultima?.tipo === "quiero") reanudacion = "El rival quiso. Conservás el turno. ";
        else if (mesa.dador === 0 && mesa.cartas.length === 3) reanudacion = "Quisiste el truco. El rival conservó la salida. ";
        guia.textContent = reanudacion + situacionDeJuego(mesa);
      } else {
        guia.textContent = "En cualquiera de tus turnos podés ofrecer jugar por 2 antes de tirar. En este ejercicio el rival va a querer tu oferta.";
        controles.append(boton("Cantar truco", () => actuar({ tipo: "truco", asiento: 0 })));
      }
    }
    if (cursor === null && (resultado || acciones.length === 0 || pendiente)) {
      controles.append(boton(mesa.dador === 3 ? "Practicar la respuesta" : "Practicar el canto",
        () => repetir("otro-papel"), "ap-link"));
    }
    if (enfocar) pregunta.focus();
  }

  window.addEventListener("pageshow", (evento) => {
    if (evento.persisted && juego.reanudar()) pintar();
  });
  el("leccion-truco").hidden = false;
  pintar();
}
