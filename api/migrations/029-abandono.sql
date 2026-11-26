-- La salida de un asiento (abandono o desconexión prolongada) queda en el asiento y en el replay.
-- El cedido por baja de cuenta deja `salida` nula: no es una derrota que se muestre.
ALTER TABLE juego.asientos
  ADD COLUMN salida text CHECK (salida IN ('abandonada', 'desconectada')),
  ADD COLUMN salida_fecha timestamptz,
  ADD CONSTRAINT salida_completa CHECK ((salida IS NULL) = (salida_fecha IS NULL));

-- Como la indicación, la salida tiene secuencia de presentación pero no posición de jugada.
ALTER TABLE juego.eventos_chico
  DROP CONSTRAINT eventos_chico_evento_check,
  DROP CONSTRAINT eventos_chico_check1,
  ADD CONSTRAINT eventos_chico_evento_check
    CHECK ((evento->>'tipo' IN ('reparto','decision','cierre','indicacion','salida')) IS TRUE),
  ADD CONSTRAINT eventos_chico_sin_posicion
    CHECK ((posicion IS NULL) = (evento->>'tipo' IN ('indicacion','salida')));

-- La salida no es un hecho de juego: no cuenta entre las jugadas que la vista debe encontrar en juego.manos.
CREATE OR REPLACE VIEW juego.replays_chico_v1 AS
SELECT r.mesa, r.cabecera || jsonb_build_object('eventos', historial.eventos) AS replay
FROM juego.replays_chico r CROSS JOIN LATERAL (
  SELECT jsonb_agg(e.evento || jsonb_build_object('secuencia', e.secuencia) ORDER BY e.secuencia) AS eventos,
    count(*) FILTER (WHERE e.evento->>'tipo' NOT IN ('cierre', 'salida')) AS hechos, max(e.secuencia) AS ultima, count(*) AS total
  FROM juego.eventos_chico e WHERE e.mesa = r.mesa
) historial
WHERE historial.ultima = historial.total AND historial.hechos = (
  SELECT sum(1 + jsonb_array_length(h.acciones) + jsonb_array_length(h.indicaciones)) FROM juego.manos h WHERE h.mesa = r.mesa
);
