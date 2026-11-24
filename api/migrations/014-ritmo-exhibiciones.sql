ALTER TABLE juego.mesas
  ADD COLUMN proximo_paso timestamptz NOT NULL DEFAULT '-infinity',
  ADD COLUMN fallos_exhibicion integer NOT NULL DEFAULT 0 CHECK (fallos_exhibicion >= 0);
ALTER TABLE juego.cupos_exhibicion ADD COLUMN disponible_desde timestamptz NOT NULL DEFAULT '-infinity';

CREATE OR REPLACE VIEW juego.mesas_en_juego AS
  SELECT id, modo, meta, origen, ultimo_hecho_publico FROM juego.mesas
  WHERE publica AND fin_publico IS NULL AND NOT exhibicion_retirada AND fallos_exhibicion = 0
    AND ultimo_hecho_publico >= statement_timestamp() - CASE origen
      WHEN 'exhibicion' THEN interval '60 seconds' ELSE interval '5 minutes' END;
