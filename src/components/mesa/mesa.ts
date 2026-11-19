import { crearMesaGuiada, type VistaGuiada } from "../../aprendizaje/mano-guiada";
import { comparar, temas } from "../../aprendizaje/lecciones";
import type { Respuesta } from "../../aprendizaje/tipos";
import { canto } from "../../lib/cantos";
import type { CardId } from "../../motor/cartas";
import { mostrarCarta } from "../aprendizaje/cartas";
import { asientos, nombre, pareja, resultadoMano, resultadoVuelta, situacionDeJuego, ultimaJugada } from "./relato";
import { boton, pintarTapete } from "./tapete";
import { montarConsultaChances } from "./consulta-chances";

function pintarHistorial({ mesa }: VistaGuiada) {
  const lista = document.getElementById("vueltas")!;
  lista.replaceChildren();
  document.querySelector<HTMLElement>(".mesa-historial")!.hidden = !mesa.vueltas.length;
  for (const [i, vuelta] of mesa.vueltas.entries()) {
    const item = document.createElement("li");
    const detalle = document.createElement("details");
    const resumen = document.createElement("summary");
    resumen.textContent = `Vuelta ${i + 1} · ${resultadoVuelta(vuelta)}`;
    const cartas = document.createElement("ol");
    for (const { asiento, carta } of vuelta.jugadas) {
      const fila = document.createElement("li");
      fila.textContent = asientos[asiento] + " · " + nombre(carta);
      cartas.append(fila);
    }
    detalle.append(resumen, cartas);
    item.append(detalle);
    lista.append(item);
  }
}

export function montarMesa() {
  const base = document.querySelector<HTMLElement>(".guiada")!.dataset.base!;
  const juego = crearMesaGuiada();
  const el = (id: string) => document.getElementById(id)!;
  const pregunta = el("pregunta");
  const decisiones = el("decisiones");
  const aviso = el("aviso-mesa");
  const cuenta = el("cuenta-mesa") as HTMLFormElement;
  const total = el("total-mesa") as HTMLInputElement;
  const cartas = el("mis-cartas");
  const pista = el("pista-mesa");
  const chances = montarConsultaChances(el("consulta-chances"));
  const consulta = document.querySelector<HTMLDetailsElement>(".mesa-consulta")!;
  new MutationObserver(() => {
    if (consulta.open) juego.consultarRegla();
  }).observe(consulta, { attributeFilter: ["open"] });

  function responder(respuesta: Respuesta) {
    if (juego.responder(respuesta)) {
      pintar(true);
    } else {
      mostrarAviso(juego.vista());
    }
  }

  function mostrarAviso(vista: VistaGuiada) {
    const { mensaje, paso, pista, reproduccion, mesa } = vista;
    aviso.textContent = reproduccion ? "" : [mensaje || (!paso && ultimaJugada(mesa)), pista && "Pista · " + pista].filter(Boolean).join(" ");
  }

  function avanzarReplay(posicion: number | null) {
    juego.reproducir(posicion);
    pintar(true);
  }

  function repartir() {
    juego.repartirDeNuevo();
    pintar(true);
  }

  function pintar(enfocar = false) {
    const vista = juego.vista();
    const { mesa, paso, reproduccion } = vista;
    chances.mostrarTurno(!paso && mesa.turno === mesa.asiento ? mesa : null);
    const enJuego = !paso && !reproduccion && mesa.turno !== null;
    pintarTapete(base, mesa, { enReparto: !!paso, finDeVuelta: !!reproduccion });
    el("siguiente-leccion").hidden = !!paso || !!reproduccion || mesa.turno !== null;
    pintarHistorial(vista);
    decisiones.replaceChildren();
    cartas.replaceChildren();
    cuenta.hidden = paso?.tipo !== "responder-total";
    pista.hidden = !paso;
    consulta.open = false;
    el("aviso-consulta-mesa").hidden = !paso;
    const guia = el("guia-turno");
    const momento = el("momento");
    let confirmar: HTMLButtonElement | undefined;

    if (paso) {
      momento.textContent = vista.tema!;
      pregunta.textContent = paso.consigna;
      if (paso.tipo === "decidir-flor") {
        guia.textContent = "Mirá tus tres cartas y el palo de la muestra.";
        for (const hayFlor of [true, false]) decisiones.append(boton(hayFlor ? "Tengo flor" : canto["paso-flor"],
          () => responder({ tipo: paso.tipo, hayFlor }), "ap-opcion"));
      } else if (paso.tipo === "elegir-cartas") {
        guia.textContent = "Marcá las cartas que vas a contar.";
        confirmar = boton("Confirmar cartas", () => responder({ tipo: paso.tipo, cartas: juego.vista().seleccion }));
        confirmar.disabled = !vista.seleccion.length;
        decisiones.append(confirmar);
      } else {
        guia.textContent = "Sumá los tantos de las cartas marcadas.";
        total.value = "";
      }
    } else if (reproduccion) {
      const jugadas = mesa.vueltas.flatMap((v) => v.jugadas).concat(mesa.vueltaActual?.jugadas ?? []);
      const ultima = jugadas.at(-1);
      momento.textContent = "Reproducción";
      pregunta.textContent = `Jugada ${reproduccion.posicion} de ${reproduccion.total}`;
      guia.textContent = ultima ? asientos[ultima.asiento] + (ultima.asiento === 0 ? " jugaste " : " jugó ") + nombre(ultima.carta) + "."
        : "Así empezó la mano, antes de la primera carta.";
      if (ultima && jugadas.length % 4 === 0) guia.textContent += " " + resultadoVuelta(mesa.vueltas.at(-1)!);
      const atras = boton("Anterior", () => avanzarReplay(reproduccion.posicion - 1), "ap-opcion");
      atras.disabled = reproduccion.posicion === 0;
      decisiones.append(atras);
      if (reproduccion.posicion < reproduccion.total) decisiones.append(boton("Siguiente jugada", () => avanzarReplay(reproduccion.posicion + 1)));
      decisiones.append(boton("Volver al resultado", () => avanzarReplay(null), "ap-link"));
    } else if (enJuego) {
      momento.textContent = "Tu turno · Vuelta " + (mesa.vueltas.length + 1);
      pregunta.textContent = mesa.vueltaActual!.jugadas.length ? "¿Qué carta jugás?" : "¿Con cuál salís?";
      guia.textContent = situacionDeJuego(mesa);
    } else {
      momento.textContent = "Resultado de la mano";
      pregunta.textContent = pareja(mesa.equipoGanador!) + " ganó la mano";
      guia.textContent = resultadoMano(mesa);
      decisiones.append(boton("Repartir de nuevo", repartir), boton("Reproducir la mano", () => avanzarReplay(0), "ap-opcion"));
    }

    for (const id of mesa.cartas) {
      let accion: (() => void) | undefined;
      if (enJuego) accion = () => { if (juego.jugar(id)) pintar(true); };
      if (confirmar) accion = () => {
        const seleccion = juego.marcar(id);
        carta.setAttribute("aria-pressed", String(seleccion.includes(id)));
        confirmar!.disabled = !seleccion.length;
      };
      const carta = mostrarCarta(base, id, accion);
      if (confirmar) carta.setAttribute("aria-pressed", String(vista.seleccion.includes(id)));
      if (paso?.tipo === "responder-total" && vista.seleccion.includes(id)) carta.classList.add("ap-elegida");
      if (enJuego) carta.setAttribute("aria-label", "Jugar " + nombre(id));
      cartas.append(carta);
    }
    mostrarAviso(vista);
    const tema = temas.find((t) => t.titulo === vista.tema);
    el("regla-mesa").textContent = tema?.regla ?? (enJuego ? comparar.regla :
      "Si cada pareja gana una vuelta, decide la tercera. Si la tercera sale parda, gana quien hizo la primera. Con tres pardas gana la pareja del mano.");
    (el("leer-regla") as HTMLAnchorElement).href = base + "reglas/" + (tema?.capitulo ?? (enJuego ? "jerarquia" : "bazas")) + "/";
    if (enfocar) (cuenta.hidden ? pregunta : total).focus();
  }

  cuenta.addEventListener("submit", (e) => {
    e.preventDefault();
    if (Number.isSafeInteger(total.valueAsNumber)) responder({ tipo: "responder-total", total: total.valueAsNumber });
  });
  pista.addEventListener("click", () => { juego.pedirPista(); mostrarAviso(juego.vista()); });
  // El historial del navegador puede restaurar una página anterior al último reparto de la pestaña.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && juego.reanudar()) pintar();
  });
  el("mesa-guiada").hidden = false;
  pintar();
}
