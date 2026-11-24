import { useEffect, useState } from "react";
import "./comunidad.css";
import { contar } from "../../lib/eventos";
import { discordComunidad } from "../../lib/comunidad";

export default function Comunidad({ jugador }: { jugador: string }) {
  const [visible, mostrar] = useState(false);
  const clave = "truco.comunidad.oculta." + jugador;
  useEffect(() => {
    try { mostrar(localStorage.getItem(clave) !== "1"); }
    catch { mostrar(true); }
  }, [clave]);
  function cerrar() {
    try { localStorage.setItem(clave, "1"); } catch { /* Se oculta durante esta visita. */ }
    mostrar(false);
  }
  return visible && <aside className="j-comunidad" aria-label="Comunidad de Discord">
    <div><h2>¿Buscás con quién jugar?</h2>
      <p>Sumate a la comunidad de Discord para encontrar jugadores y conversar sobre el truco.</p>
      <a className="j-link" href={discordComunidad} onClick={() => contar("discord")} target="_blank" rel="noopener noreferrer">Unirme al Discord ↗</a>
    </div>
    <button className="j-sec" type="button" onClick={cerrar}>Ahora no</button>
  </aside>;
}
