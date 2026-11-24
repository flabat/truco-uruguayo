import { createTikTokStyleCaptions, serializeSrt } from "@remotion/captions";
import { Audio } from "@remotion/media";
import { useMemo } from "react";
import { Artifact, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Linea } from "../lib/linea.ts";
import type { Voz } from "../lib/voz.ts";
import { Subtitulos } from "./Subtitulos";

/** La voz cortada por líneas, los subtítulos en pantalla y el SRT que acompaña al MP4. */
export const Narracion = ({ L, voz }: { L: Linea; voz: Voz }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const paginas = useMemo(() => createTikTokStyleCaptions({ captions: L.subtitulos, combineTokensWithinMilliseconds: 4000 }).pages, [L]);
  const pagina = paginas.findLast((p) => p.startMs <= ms);
  const srt = useMemo(() => serializeSrt({ lines: paginas.map((p) => p.tokens.map((k) => ({
    text: k.text, startMs: k.fromMs, endMs: k.toMs, timestampMs: null, confidence: null }))) }), [paginas]);
  return (
    <>
      {frame === 0 && <Artifact filename="subtitulos.es.srt" content={srt} />}
      {voz.archivo && L.tramos.map((tr) => (
        <Sequence key={tr.id} from={Math.round(tr.inicio * fps)} durationInFrames={Math.max(1, Math.ceil((tr.hasta - tr.desde) * fps))}>
          <Audio src={staticFile(voz.archivo)} trimBefore={Math.round(tr.desde * fps)} trimAfter={Math.round(tr.hasta * fps)} />
        </Sequence>
      ))}
      <Subtitulos pagina={pagina} ms={ms} />
    </>
  );
};
