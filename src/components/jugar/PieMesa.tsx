import { useEffect } from "react";
import { createPortal } from "react-dom";
import FichaModelo from "../FichaModelo";
import type { Mesa, VersionesMesa } from "./cliente";

export default function PieMesa({ mesa }: { mesa: VersionesMesa & Pick<Mesa, "modo" | "formato"> }) {
  const { modo, formato, versionReglas, politica, edicionModelo } = mesa;
  useEffect(() => {
    const motor = document.getElementById("version-motor-mesa");
    if (!motor) return;
    const sinMesa = motor.textContent;
    motor.textContent = versionReglas == null ? "Sin informar" : `v${versionReglas}`;
    return () => { motor.textContent = sinMesa; };
  }, [versionReglas]);

  const modelo = document.getElementById("version-modelo-mesa");
  const formatoModelo = formato ?? { "1v1": "duel", "2v2": "pairs", "3v3": "triples" }[modo];
  return modelo && createPortal(
    politica ? <FichaModelo id={politica} formato={formatoModelo} edicion={edicionModelo} /> : "Sin informar",
    modelo,
  );
}
