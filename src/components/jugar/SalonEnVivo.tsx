import { useEffect, useRef } from "react";
import { participantesMesa, type ResumenMesa } from "@eltruco/cliente/salon.ts";
import { useConsultaSalon } from "./useConsultaSalon";
import "./salon.css";

interface AccionesSalon {
  mirar: (id: string) => void;
  crear: () => void;
  volverAMiMesa?: () => void;
  alPerderSesion: () => void;
}

export default function SalonEnVivo({ mirar, crear, volverAMiMesa, alPerderSesion }: AccionesSalon) {
  const { datos, estado, reintentar } = useConsultaSalon<{ mesas: ResumenMesa[] }>("/api/salon/mesas", 15_000);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  useEffect(() => {
    if (estado === "sin-sesion") alPerderSesion();
  }, [estado, alPerderSesion]);

  const error = estado === "error" || estado === "no-disponible";
  const mesas = datos?.mesas;

  return (
    <section className="j-salon" aria-labelledby="titulo-salon">
      <header className="j-salon-cabecera">
        <h2 id="titulo-salon" tabIndex={-1} ref={titulo}>Mesas en juego</h2>
        <div className="j-acciones">
          {volverAMiMesa && <button type="button" className="j-sec" onClick={volverAMiMesa}>Volver a mi mesa</button>}
          <button type="button" className="button" onClick={crear}>Crear mi mesa</button>
        </div>
      </header>
      {estado === "cargando" && !datos && <p role="status">Buscando mesas…</p>}
      {error && (
        <div className="j-salon-error">
          <p role="status">{datos ? "Reconectando con el salón…" : "No se pudo cargar la lista de mesas."}</p>
          <button type="button" className="j-sec" onClick={reintentar}>Reintentar</button>
        </div>
      )}
      {estado === "listo" && mesas?.length === 0 && <p role="status">Todavía no hay mesas en juego.</p>}
      {mesas && mesas.length > 0 && estado !== "sin-sesion" && estado !== "no-disponible" && (
        <ul className="j-salon-lista" aria-label="Mesas públicas">
          {mesas.map(mesa => (
            <li key={mesa.id}>
              <div id={"resumen-" + mesa.id} className="j-salon-resumen">
                <h3>{mesa.modo === "1v1" ? "Duelo" : "Parejas"}</h3>
                <span>{participantesMesa(mesa)}</span>
              </div>
              <p className="j-salon-puntos">Mano {mesa.manoNumero} · {mesa.puntos[0]} a {mesa.puntos[1]} de {mesa.meta}</p>
              <button type="button" className="j-sec" aria-describedby={"resumen-" + mesa.id} onClick={() => mirar(mesa.id)}>
                Mirar mesa
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
