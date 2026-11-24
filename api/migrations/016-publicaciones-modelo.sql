-- Incluye las activaciones que lleguen mientras se instala el registro.
LOCK TABLE juego.activaciones IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE juego.publicaciones_modelo (
  pin text PRIMARY KEY CHECK (pin ~ '^[a-f0-9]{64}$'),
  formato text,
  edicion integer CHECK (edicion > 0),
  nombre text,
  publicada_el date,
  UNIQUE (formato, edicion),
  CHECK (num_nonnulls(formato, edicion, nombre, publicada_el) IN (0, 4))
);

-- Primeras publicaciones documentadas en producción (issue #251).
INSERT INTO juego.publicaciones_modelo (pin, formato, edicion, nombre, publicada_el) VALUES
  ('d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3', 'duel', 1, 'Ceibo Duelo', DATE '2026-11-20'),
  ('6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2', 'pairs', 1, 'Ceibo Parejas', DATE '2026-11-20'),
  ('d2b2293d4d8c9ee4f067ee74c1d6d5983eb5c8ad3a4ebce57bbdb561f946b78b', 'pairs-private-senas', 1, 'Ceibo Parejas con señas', DATE '2026-11-20');

-- Una activación anterior o una mesa que ya recibió este pin acredita su uso,
-- pero no la fecha original. Un ensayo privado puede probar actores inéditos.
INSERT INTO juego.publicaciones_modelo (pin)
  SELECT pin FROM juego.activaciones
  UNION
  SELECT politica FROM juego.mesas WHERE origen <> 'ensayo' AND politica ~ '^[a-f0-9]{64}$'
  ON CONFLICT (pin) DO NOTHING;

CREATE FUNCTION juego.registrar_publicacion_modelo() RETURNS trigger LANGUAGE plpgsql AS $$
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
    ELSE NEW.formato
  END;

  INSERT INTO juego.publicaciones_modelo (pin, formato, edicion, nombre, publicada_el)
    VALUES (NEW.pin, NEW.formato, proxima_edicion, modalidad || ' ' || proxima_edicion,
            (clock_timestamp() AT TIME ZONE 'America/Montevideo')::date)
    ON CONFLICT (pin) DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER registrar_publicacion_modelo AFTER INSERT OR UPDATE OF pin ON juego.activaciones
  FOR EACH ROW EXECUTE FUNCTION juego.registrar_publicacion_modelo();
