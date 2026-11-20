import { useEffect, useRef, useState } from "react";
import { mensajeDe, pedir } from "./cliente";

export function VozDiscord({ ruta }: { ruta: string }) {
  const [pendiente, ocupar] = useState(false);
  const [destino, guardar] = useState<{ enlace: string; vence: string }>();
  const [aviso, avisar] = useState("");
  const solicitud = useRef<AbortController | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const enlace = useRef<HTMLAnchorElement>(null);
  useEffect(() => () => solicitud.current?.abort(), []);
  useEffect(() => {
    if (!destino) return;
    if (document.activeElement === boton.current) enlace.current?.focus();
    const timer = setTimeout(() => {
      if (document.activeElement === enlace.current) boton.current?.focus();
      guardar(undefined);
      avisar("El enlace venció. Podés pedir otro para esta mesa.");
    }, Math.max(0, Date.parse(destino.vence) - Date.now()));
    return () => clearTimeout(timer);
  }, [destino]);
  async function preparar() {
    if (solicitud.current) return;
    const controller = new AbortController();
    solicitud.current = controller;
    ocupar(true);
    avisar("Preparando el enlace…");
    try {
      const d = await pedir<{ enlace: string; vence: string }>(ruta + "/voz", {}, controller.signal);
      guardar(d);
      avisar("Enlace listo.");
    } catch (e) {
      if (!controller.signal.aborted) avisar(mensajeDe(e));
    } finally {
      solicitud.current = null;
      if (!controller.signal.aborted) ocupar(false);
    }
  }
  return <section className="j-discord" aria-label="Voz de la mesa">
    <p id="alcance-voz"><strong>Voz en Discord</strong><br />
      Sala abierta. Cualquier persona con acceso a la categoría Mesas puede entrar y escuchar.</p>
    <div>
      <button type="button" className="j-sec" aria-describedby="alcance-voz" aria-disabled={pendiente}
        ref={boton} onClick={preparar}>{destino ? "Renovar enlace" : "Abrir voz de la mesa"}</button>
      {destino && <a className="j-link" ref={enlace} href={destino.enlace} target="_blank"
        rel="noopener noreferrer">Entrar a Discord ↗</a>}
      <span role="status">{aviso}</span>
    </div>
  </section>;
}
