import { comparar, reconocerFlor, temas, type Tema } from "../../aprendizaje/lecciones";
import { crearSelectorEjemplos } from "../../aprendizaje/lecciones/ejemplos";
import { generarPractica } from "../../aprendizaje/lecciones/practica";
import { crearFuenteProgreso, elegirHabilidad, estaAprendida, progresoDe } from "../../aprendizaje/progreso";
import { montarEjercicio } from "./ejercicio";

export function iniciarRuta() {
  const app = document.getElementById("aprendizaje")!;
  const ruta = document.getElementById("ruta")!;
  const practica = document.getElementById("practica")!;
  const fuente = crearFuenteProgreso();
  const seleccionarEjemplo = crearSelectorEjemplos();
  const ejercicio = montarEjercicio(app.dataset.base!);
  let modo: "tema" | "inicio" | "mixta" = "tema";
  let consulta = location.search;
  let ejemploVisible: { modo: typeof modo; tema: string; id: string } | null = null;

  function guardarEntrada(ejemplo: typeof ejemploVisible) {
    ejemploVisible = ejemplo;
    history.replaceState({ ...history.state, ejemplo }, "");
  }

  function avance(tema: Tema) {
    const progreso = fuente.actual;
    const casos = progresoDe(progreso, tema.habilidad).casos.filter((caso) => tema.familias.includes(caso.familia));
    if (!casos.length) return "Sin practicar";
    const aciertos = casos.filter((caso) => caso.acreditado).length;
    const estado = estaAprendida(progreso, tema.habilidad, tema.familias) ? "Aprendido" : "En práctica";
    return `${estado} · ${aciertos} ${aciertos === 1 ? "mano resuelta" : "manos resueltas"} sin ayuda al primer intento`;
  }

  function mostrarRuta(enfocar: boolean) {
    ejemploVisible = null;
    practica.hidden = true;
    ruta.hidden = false;
    for (const tema of temas) {
      ruta.querySelector<HTMLElement>(`[data-avance="${tema.id}"]`)!.textContent = avance(tema);
    }
    const conHistorial = temas.some((tema) => progresoDe(fuente.actual, tema.habilidad).casos.length);
    const principal = ruta.querySelector<HTMLAnchorElement>("#inicio-principal")!;
    principal.search = conHistorial ? "?modo=mixta" : "?modo=inicio";
    principal.querySelector("span")!.textContent = conHistorial ? "Retomar práctica mixta" : "Empezar con un ejemplo";
    document.getElementById("volver-inicio")!.hidden = !conHistorial;
    if (conHistorial) {
      document.getElementById("bienvenida")!.textContent =
        "Retomá la práctica mixta o elegí un tema para ver otro ejemplo y pasar a una mano nueva.";
    }
    if (enfocar) ruta.querySelector("h1")!.focus();
  }

  function mixto() {
    const habilidad = elegirHabilidad(temas, fuente.actual);
    return temas.find((tema) => tema.habilidad === habilidad)!;
  }

  function abrir(tema: Tema, conEjemplo: boolean, restaurarId?: string) {
    ruta.hidden = true;
    practica.hidden = false;
    const rotulo = modo === "mixta" ? "Práctica mixta" : "Práctica por tema";
    document.getElementById("modo")!.textContent = modo === "inicio"
      ? `Primeros cinco minutos · ${tema === comparar ? "1" : "2"} de 2` : rotulo;
    const actualizarAvance = () => { document.getElementById("avance-actual")!.textContent = avance(tema); };
    actualizarAvance();

    function empezar() {
      if (ejemploVisible || history.state?.ejemplo) guardarEntrada(null);
      const semilla = crypto.getRandomValues(new Uint32Array(1))[0];
      const sesion = generarPractica(tema, semilla, fuente);
      actualizarAvance();
      let siguiente = "Otra mano";
      if (modo === "inicio") siguiente = tema === comparar ? "Seguir con reconocer flor" : "Seguir con práctica mixta";
      ejercicio.practicar(tema, sesion, siguiente, () => {
        if (modo === "tema") abrir(tema, false);
        else if (modo === "inicio" && tema === comparar) abrir(reconocerFlor, true);
        else if (modo === "inicio") navegar("?modo=mixta");
        else abrirMixta();
      }, actualizarAvance);
    }
    function mostrarEjemplo(id?: string, enfocarPregunta = false) {
      const ejemplo = seleccionarEjemplo(tema, id);
      guardarEntrada({ modo, tema: tema.id, id: ejemplo.id });
      ejercicio.mostrarEjemplo(tema, ejemplo, empezar, () => mostrarEjemplo(undefined, true), enfocarPregunta);
    }
    if (conEjemplo) mostrarEjemplo(restaurarId);
    else empezar();
  }

  function abrirMixta() {
    const tema = mixto();
    abrir(tema, !progresoDe(fuente.actual, tema.habilidad).casos.length);
  }

  function leerRuta(enfocar: boolean) {
    const params = new URLSearchParams(location.search);
    const tema = temas.find((opcion) => opcion.id === params.get("tema"));
    const entrada = history.state?.ejemplo;
    if (tema) {
      modo = "tema";
      abrir(tema, true, entrada?.modo === modo && entrada.tema === tema.id ? entrada.id : undefined);
    } else if (params.get("modo") === "inicio") {
      modo = "inicio";
      const paso = entrada?.modo === modo && entrada.tema === reconocerFlor.id ? reconocerFlor : comparar;
      abrir(paso, true, entrada?.modo === modo && entrada.tema === paso.id ? entrada.id : undefined);
    } else if (params.get("modo") === "mixta") {
      modo = "mixta";
      const guardado = entrada?.modo === modo && temas.find((opcion) => opcion.id === entrada.tema);
      if (guardado) abrir(guardado, true, entrada.id);
      else abrirMixta();
    } else {
      mostrarRuta(enfocar);
    }
  }

  function navegar(url: string) {
    history.pushState(null, "", url);
    consulta = location.search;
    leerRuta(true);
  }

  app.addEventListener("click", (event) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const enlace = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[data-ruta]");
    if (enlace) {
      event.preventDefault();
      navegar(enlace.href);
    }
  });
  window.addEventListener("popstate", ({ state }) => {
    const entrada = state?.ejemplo;
    if (location.search !== consulta || (entrada && (entrada.tema !== ejemploVisible?.tema || entrada.id !== ejemploVisible?.id))) {
      leerRuta(true);
    } else if (location.hash && ejemploVisible && !entrada) {
      // El salto nativo a #contenido también puede crear una entrada mientras se lee.
      guardarEntrada(ejemploVisible);
    }
    consulta = location.search;
  });
  leerRuta(false);
}
