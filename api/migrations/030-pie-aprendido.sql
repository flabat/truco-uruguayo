-- Actores aprendidos al pie (issue #461): claves propias de registro y activación para parejas y tercetos al pie.
ALTER TABLE juego.artefactos DROP CONSTRAINT artefactos_formato_check,
  ADD CONSTRAINT artefactos_formato_check
  CHECK (formato IN ('duel','pairs','pairs-senas','pairs-private-senas','pairs-pie','triples-pie'));
ALTER TABLE juego.activaciones DROP CONSTRAINT activaciones_formato_check,
  ADD CONSTRAINT activaciones_formato_check
  CHECK (formato IN ('duel','pairs','pairs-senas','pairs-private-senas','pairs-pie','triples-pie'));

CREATE OR REPLACE FUNCTION juego.registrar_publicacion_modelo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  proxima_edicion integer;
  modalidad text;
BEGIN
  IF EXISTS (SELECT FROM juego.publicaciones_modelo WHERE pin = NEW.pin) THEN
    RETURN NULL;
  END IF;

  -- La fila única de activaciones por formato está bloqueada hasta el commit.
  SELECT coalesce(max(edicion), 0) + 1 INTO proxima_edicion
    FROM juego.publicaciones_modelo WHERE formato = NEW.formato;
  modalidad := CASE NEW.formato
    WHEN 'duel' THEN 'Duelo'
    WHEN 'pairs' THEN 'Parejas'
    WHEN 'pairs-private-senas' THEN 'Parejas con señas'
    WHEN 'pairs-senas' THEN 'Parejas con señas públicas'
    WHEN 'pairs-pie' THEN 'Parejas al pie'
    WHEN 'triples-pie' THEN 'Tercetos al pie'
    ELSE NEW.formato
  END;

  INSERT INTO juego.publicaciones_modelo (pin, formato, edicion, nombre, publicada_el)
    VALUES (NEW.pin, NEW.formato, proxima_edicion, modalidad || ' ' || proxima_edicion,
            (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date)
    ON CONFLICT (pin) DO NOTHING;
  RETURN NULL;
END;
$$;
