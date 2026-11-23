-- Las jugadas conservan sus posiciones para perfiles, cobros y reportes. Una palabra
-- tiene únicamente secuencia de presentación, entre los hechos que la rodean.
ALTER TABLE juego.eventos_chico
  ALTER COLUMN posicion DROP NOT NULL,
  DROP CONSTRAINT eventos_chico_evento_check,
  ADD CHECK ((evento->>'tipo' IN ('reparto','decision','cierre','indicacion')) IS TRUE),
  ADD CHECK ((posicion IS NULL) = (evento->>'tipo' = 'indicacion'));

CREATE OR REPLACE VIEW juego.replays_chico_v1 AS
SELECT r.mesa, r.cabecera || jsonb_build_object('eventos', historial.eventos) AS replay
FROM juego.replays_chico r CROSS JOIN LATERAL (
  SELECT jsonb_agg(e.evento || jsonb_build_object('secuencia', e.secuencia) ORDER BY e.secuencia) AS eventos,
    count(*) FILTER (WHERE e.evento->>'tipo' <> 'cierre') AS hechos, max(e.secuencia) AS ultima, count(*) AS total
  FROM juego.eventos_chico e WHERE e.mesa = r.mesa
) historial
WHERE historial.ultima = historial.total AND historial.hechos = (
  SELECT sum(1 + jsonb_array_length(h.acciones) + jsonb_array_length(h.indicaciones)) FROM juego.manos h WHERE h.mesa = r.mesa
);

ALTER TABLE juego.reportes ADD COLUMN indicaciones smallint CHECK (indicaciones BETWEEN 0 AND 12),
  DROP CONSTRAINT reportes_pantalla,
  ADD CONSTRAINT reportes_pantalla UNIQUE NULLS NOT DISTINCT
    (mesa, mano, posicion, asiento, vuelta, puntos, fase, cliente, voz, duelo, indicaciones);

-- Una indicación es pública desde su confirmación.
CREATE OR REPLACE FUNCTION juego.registrar_actividad_salon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE juego.mesas m SET ultimo_hecho_publico = statement_timestamp(),
    fin_publico = CASE WHEN hechos.cierre THEN statement_timestamp() END
  FROM (
    SELECT mesa, bool_or(mano = 1 AND evento->>'tipo' = 'reparto') AS primer_reparto,
      bool_or(evento->>'tipo' = 'cierre') AS cierre
    FROM confirmados c
    WHERE evento->>'tipo' IN ('reparto', 'cierre', 'indicacion')
       OR (evento->>'tipo' = 'decision' AND (evento #>> '{accion,tipo}' <> 'paso-flor'
         OR EXISTS (
           SELECT 1 FROM juego.eventos_chico inicio
           WHERE inicio.mesa = c.mesa AND inicio.mano = c.mano AND inicio.posicion = 0
             AND (inicio.evento #> '{reparto,respondenSinFlor}') @> (c.evento #> '{accion,asiento}')
         )))
    GROUP BY mesa
  ) hechos
  WHERE m.id = hechos.mesa AND m.publica AND m.fin_publico IS NULL AND NOT m.exhibicion_retirada
    AND (m.ultimo_hecho_publico IS NOT NULL OR hechos.primer_reparto);
  RETURN NULL;
END;
$$;
