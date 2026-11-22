-- «Yo no canto» de una computadora es una jugada pública en los repartos que lo habilitan.
CREATE OR REPLACE FUNCTION juego.registrar_actividad_salon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE juego.mesas m SET ultimo_hecho_publico = statement_timestamp(),
    fin_publico = CASE WHEN hechos.cierre THEN statement_timestamp() END
  FROM (
    SELECT mesa, bool_or(mano = 1 AND evento->>'tipo' = 'reparto') AS primer_reparto,
      bool_or(evento->>'tipo' = 'cierre') AS cierre
    FROM confirmados c
    WHERE evento->>'tipo' IN ('reparto', 'cierre')
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
