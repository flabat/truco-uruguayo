import { comparar, reconocerFlor, temas, type Tema } from "../../aprendizaje/lecciones";
import { claveSituacion, proveedorSituaciones } from "../../aprendizaje/generadores";
import { crearFuenteProgreso, elegirHabilidad, estaAprendida, progresoDe } from "../../aprendizaje/progreso";
import { generarSesion } from "../../aprendizaje/sesion";
import { montarEjercicio } from "./ejercicio";

export function iniciarRuta() {
  const app = document.getElementById("aprendizaje")!;
  const ruta = document.getElementById("ruta")!;
  const practica = document.getElementById("practica")!;
  const fuente = crearFuenteProgreso();
  const ejercicio = montarEjercicio(app.dataset.base!);
  let modo: "tema" | "inicio" | "mixta" = "tema";
  let consulta = location.search;

  function avance(tema: Tema) {
    const progreso = fuente.actual;
    const casos = progresoDe(progreso, tema.habilidad).casos.filter((caso) => tema.familias.includes(caso.familia));
    if (!casos.length) return "Sin practicar";
    const aciertos = casos.filter((caso) => caso.acreditado).length;
    const estado = estaAprendida(progreso, tema.habilidad, tema.familias) ? "Aprendido" : "En práctica";
    return `${estado} · ${aciertos} ${aciertos === 1 ? "mano resuelta" : "manos resueltas"} sin ayuda al primer intento`;
  }

  function mostrarRuta(enfocar: boolean) {
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
        "Seguí con una mezcla de los temas que ya practicaste o elegí uno para probar una mano nueva.";
    }
    if (enfocar) ruta.querySelector("h1")!.focus();
  }

  function mixto() {
    const habilidad = elegirHabilidad(temas, fuente.actual);
    return temas.find((tema) => tema.habilidad === habilidad)!;
  }

  function abrir(tema: Tema, conEjemplo: boolean) {
    ruta.hidden = true;
    practica.hidden = false;
    const rotulo = modo === "mixta" ? "Práctica mixta" : "Práctica por tema";
    document.getElementById("modo")!.textContent = modo === "inicio"
      ? `Primeros cinco minutos · ${tema === comparar ? "1" : "2"} de 2` : rotulo;
    const actualizarAvance = () => { document.getElementById("avance-actual")!.textContent = avance(tema); };
    actualizarAvance();

    function empezar() {
      const semilla = crypto.getRandomValues(new Uint32Array(1))[0];
      // El ejemplo resuelto también debe quedar fuera de las manos nuevas, sin acreditar progreso.
      const ejemplo = claveSituacion(tema.ejemplo.muestra, tema.ejemplo.cartas);
      const proveedor = {
        ...proveedorSituaciones,
        generar: (solicitud: Parameters<typeof proveedorSituaciones.generar>[0]) =>
          proveedorSituaciones.generar({ ...solicitud, recientes: [...solicitud.recientes, ejemplo] }),
      };
      const sesion = generarSesion(tema, semilla, proveedor, fuente);
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
    if (conEjemplo) ejercicio.mostrarEjemplo(tema, empezar);
    else empezar();
  }

  function abrirMixta() {
    const tema = mixto();
    abrir(tema, !progresoDe(fuente.actual, tema.habilidad).casos.length);
  }

  function leerRuta(enfocar: boolean) {
    const params = new URLSearchParams(location.search);
    const tema = temas.find((opcion) => opcion.id === params.get("tema"));
    if (tema) {
      modo = "tema";
      abrir(tema, true);
    } else if (params.get("modo") === "inicio") {
      modo = "inicio";
      abrir(comparar, true);
    } else if (params.get("modo") === "mixta") {
      modo = "mixta";
      abrirMixta();
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
  // Los enlaces a anclas del índice tienen su propio desplazamiento nativo.
  window.addEventListener("popstate", () => {
    if (location.search !== consulta) leerRuta(true);
    consulta = location.search;
  });
  leerRuta(false);
}
