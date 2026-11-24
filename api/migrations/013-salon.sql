-- Cada fila se puede bloquear para reservar un cupo. Los chicos cerrados conservan su origen.
CREATE TABLE juego.cupos_exhibicion (
  numero smallint PRIMARY KEY CHECK (numero BETWEEN 1 AND 6)
);
INSERT INTO juego.cupos_exhibicion SELECT generate_series(1, 6);

ALTER TABLE juego.mesas
  ADD COLUMN publica boolean NOT NULL DEFAULT false,
  ADD COLUMN cupo_exhibicion smallint REFERENCES juego.cupos_exhibicion(numero),
  ADD COLUMN origen text GENERATED ALWAYS AS (CASE
    WHEN cupo_exhibicion IS NOT NULL THEN 'exhibicion'
    WHEN solo_computadoras THEN 'ensayo'
    ELSE 'humana' END) STORED,
  ADD COLUMN ultimo_hecho_publico timestamptz,
  ADD COLUMN fin_publico timestamptz,
  ADD COLUMN exhibicion_retirada boolean NOT NULL DEFAULT false,
  ADD CHECK (NOT publica OR (modo IN ('1v1','2v2') AND (NOT solo_computadoras OR cupo_exhibicion IS NOT NULL))),
  ADD CHECK (cupo_exhibicion IS NULL OR (solo_computadoras AND publica AND
    (modo = '1v1' OR version_senas IS NOT DISTINCT FROM 'senas-equipo-v1'))),
  ADD CHECK (NOT exhibicion_retirada OR cupo_exhibicion IS NOT NULL);

CREATE UNIQUE INDEX cupo_exhibicion_ocupado ON juego.mesas(cupo_exhibicion)
  WHERE cupo_exhibicion IS NOT NULL AND fin_publico IS NULL AND NOT exhibicion_retirada;
CREATE INDEX mesas_actividad_salon ON juego.mesas(origen, ultimo_hecho_publico DESC, id)
  WHERE publica AND fin_publico IS NULL AND NOT exhibicion_retirada;

-- El reparto, las decisiones y el cierre ya se escriben junto con la mano y el recibo.
-- Una consulta, un reintento o un enlace de voz no insertan hechos. La seña adjunta
-- a una acción no genera otro evento. El pase interno de flor tampoco renueva la mesa.
CREATE FUNCTION juego.registrar_actividad_salon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE juego.mesas m SET ultimo_hecho_publico = statement_timestamp(),
    fin_publico = CASE WHEN hechos.cierre THEN statement_timestamp() END
  FROM (
    SELECT mesa, bool_or(mano = 1 AND evento->>'tipo' = 'reparto') AS primer_reparto,
      bool_or(evento->>'tipo' = 'cierre') AS cierre
    FROM confirmados
    WHERE evento->>'tipo' IN ('reparto', 'cierre')
       OR (evento->>'tipo' = 'decision' AND evento #>> '{accion,tipo}' <> 'paso-flor')
    GROUP BY mesa
  ) hechos
  WHERE m.id = hechos.mesa AND m.publica AND m.fin_publico IS NULL AND NOT m.exhibicion_retirada
    AND (m.ultimo_hecho_publico IS NOT NULL OR hechos.primer_reparto);
  RETURN NULL;
END;
$$;

CREATE TRIGGER actividad_salon AFTER INSERT ON juego.eventos_chico
  REFERENCING NEW TABLE AS confirmados FOR EACH STATEMENT EXECUTE FUNCTION juego.registrar_actividad_salon();

CREATE VIEW juego.mesas_en_juego AS
  SELECT id, modo, meta, origen, ultimo_hecho_publico FROM juego.mesas
  WHERE publica AND fin_publico IS NULL AND NOT exhibicion_retirada
    AND ultimo_hecho_publico >= statement_timestamp() - CASE origen
      WHEN 'exhibicion' THEN interval '60 seconds' ELSE interval '5 minutes' END;
