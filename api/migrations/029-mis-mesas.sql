-- Una sala antigua sin fecha conocida conserva NULL hasta su próximo cambio.
ALTER TABLE juego.mesas ADD COLUMN actividad_jugadores timestamptz;
UPDATE juego.mesas SET actividad_jugadores = ultimo_hecho_publico
  WHERE NOT solo_computadoras AND fin_publico IS NULL AND ultimo_hecho_publico IS NOT NULL;

CREATE FUNCTION juego.registrar_cambio_asiento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE juego.mesas SET actividad_jugadores = statement_timestamp()
    WHERE id = COALESCE(NEW.mesa, OLD.mesa) AND NOT solo_computadoras;
  RETURN NULL;
END;
$$;
CREATE TRIGGER actividad_asiento AFTER INSERT OR UPDATE OF cedido OR DELETE ON juego.asientos
  FOR EACH ROW EXECUTE FUNCTION juego.registrar_cambio_asiento();

-- El salón y los asientos comparten la definición de jugada visible. Los consejos
-- al pie mantienen su publicación en el salón. Sólo una jugada o reparto actualiza
-- la fecha que ordena Mis mesas, incluso cuando una carta lleva una seña privada.
CREATE OR REPLACE FUNCTION juego.registrar_actividad_salon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH hechos AS (
    SELECT c.mesa, bool_or(c.mano = 1 AND c.evento->>'tipo' = 'reparto') AS primer_reparto,
      bool_or(c.evento->>'tipo' = 'cierre') AS cierre,
      bool_or(c.evento->>'tipo' <> 'indicacion') AS jugada
    FROM confirmados c
    WHERE c.evento->>'tipo' IN ('reparto', 'cierre', 'indicacion')
       OR (c.evento->>'tipo' = 'decision' AND (c.evento #>> '{accion,tipo}' <> 'paso-flor'
         OR EXISTS (
           SELECT 1 FROM juego.eventos_chico inicio
           WHERE inicio.mesa = c.mesa AND inicio.mano = c.mano AND inicio.posicion = 0
             AND (inicio.evento #> '{reparto,respondenSinFlor}') @> (c.evento #> '{accion,asiento}')
         )))
    GROUP BY c.mesa
  ), cambios AS (
    SELECT h.mesa, h.cierre, h.jugada AND NOT m.solo_computadoras AS jugadores,
      m.publica AND m.fin_publico IS NULL AND NOT m.exhibicion_retirada
        AND (m.ultimo_hecho_publico IS NOT NULL OR h.primer_reparto) AS salon
    FROM hechos h JOIN juego.mesas m ON m.id = h.mesa
  )
  UPDATE juego.mesas m SET
    actividad_jugadores = CASE WHEN c.jugadores THEN statement_timestamp() ELSE m.actividad_jugadores END,
    ultimo_hecho_publico = CASE WHEN c.salon THEN statement_timestamp() ELSE m.ultimo_hecho_publico END,
    fin_publico = CASE WHEN c.salon AND c.cierre THEN statement_timestamp() ELSE m.fin_publico END
  FROM cambios c WHERE m.id = c.mesa AND (c.jugadores OR c.salon);
  RETURN NULL;
END;
$$;
