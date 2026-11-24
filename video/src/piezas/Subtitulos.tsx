import type { TikTokPage } from "@remotion/captions";

/** Subtítulos con la palabra dicha resaltada. Termina antes de y 512: debajo va la interfaz de la red. */
export const Subtitulos = ({ pagina, ms }: { pagina: TikTokPage | undefined; ms: number }) => (
  <div style={{ position: "absolute", top: 452, left: 20, right: 20, height: 58, display: "flex", gap: 10, opacity: pagina ? 1 : 0 }}>
    <div style={{ width: 4, borderRadius: 2, background: "var(--accent)" }} />
    <p style={{ margin: 0, font: "700 18px/1.25 var(--sans)", whiteSpace: "pre-wrap" }}>
      {pagina?.tokens.map((k, i) => (
        <span key={i} style={{ color: ms >= k.fromMs ? "var(--ink)" : "var(--apagado)" }}>{k.text}</span>
      ))}
    </p>
  </div>
);
