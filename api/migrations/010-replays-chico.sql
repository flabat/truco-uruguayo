-- Una cabecera certifica que se observó el chico desde su primer reparto.
CREATE TABLE juego.replays_chico (
  mesa uuid PRIMARY KEY REFERENCES juego.mesas(id) ON DELETE CASCADE,
  cabecera jsonb NOT NULL
);

-- Posición 0 = reparto. Cada acción confirmada tiene su propio índice dentro de la mano.
CREATE TABLE juego.eventos_chico (
  mesa uuid NOT NULL REFERENCES juego.mesas(id) ON DELETE CASCADE,
  mano integer NOT NULL CHECK (mano > 0),
  posicion integer NOT NULL CHECK (posicion >= 0),
  secuencia bigint NOT NULL CHECK (secuencia > 0),
  build text NOT NULL,
  evento jsonb NOT NULL,
  PRIMARY KEY (mesa, secuencia),
  UNIQUE (mesa, mano, posicion),
  CHECK ((evento->>'tipo' IN ('reparto', 'decision', 'cierre')) IS TRUE),
  CHECK ((posicion = 0) = (evento->>'tipo' = 'reparto'))
);
CREATE UNIQUE INDEX cierre_unico_chico ON juego.eventos_chico(mesa) WHERE evento->>'tipo' = 'cierre';

-- Vista privada del árbitro. Los eventos de partidas iniciadas antes de la captura
-- quedan disponibles por separado, con su mano y posición originales.
CREATE VIEW juego.replays_chico_v1 AS
SELECT r.mesa, r.cabecera || jsonb_build_object('eventos', historial.eventos) AS replay
FROM juego.replays_chico r CROSS JOIN LATERAL (
  SELECT jsonb_agg(e.evento || jsonb_build_object('secuencia', e.secuencia) ORDER BY e.secuencia) AS eventos,
    count(*) FILTER (WHERE e.evento->>'tipo' <> 'cierre') AS hechos, max(e.secuencia) AS ultima, count(*) AS total
  FROM juego.eventos_chico e WHERE e.mesa = r.mesa
) historial
-- Durante un despliegue, un escritor viejo aún puede confirmar jugadas sin eventos.
WHERE historial.ultima = historial.total AND historial.hechos = (
  SELECT sum(1 + jsonb_array_length(h.acciones)) FROM juego.manos h WHERE h.mesa = r.mesa
);
