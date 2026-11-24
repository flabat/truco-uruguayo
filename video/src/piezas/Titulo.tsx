import type { ReactNode } from "react";

/** El título de la lámina; achica la letra si el texto es largo. */
export const Titulo = ({ children, largo }: { children: ReactNode; largo: number }) => (
  <h1 style={{ position: "absolute", top: 54, left: 20, right: 20, height: 70, margin: 0, display: "flex", alignItems: "center",
    font: `400 ${largo > 30 ? 28 : largo > 22 ? 32 : 38}px/1.05 var(--serif)`, letterSpacing: "-.02em" }}>
    <span>{children}</span>
  </h1>
);
