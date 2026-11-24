CREATE TABLE juego.voz_discord (
  mesa uuid PRIMARY KEY REFERENCES juego.mesas(id),
  servidor text NOT NULL,
  categoria text NOT NULL,
  intento uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  canal text UNIQUE CHECK (canal ~ '^[0-9]{17,20}$'),
  retirando boolean NOT NULL DEFAULT false,
  vence timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  reintentar timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE INDEX voz_para_limpiar ON juego.voz_discord (servidor, categoria, greatest(vence, reintentar));

-- La actividad del juego se confirma en la misma transacción que el asiento o el turno.
-- El registro de voz nunca queda bloqueado mientras la API espera una respuesta de Discord.
CREATE FUNCTION juego.actividad_voz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'eventos_chico' THEN
    IF NEW.evento->>'tipo' = 'cierre' THEN
      UPDATE juego.voz_discord SET vence=(NEW.evento->>'fecha')::timestamptz + interval '30 minutes' WHERE mesa=NEW.mesa AND NOT retirando;
      RETURN NEW;
    END IF;
  END IF;
  UPDATE juego.voz_discord SET vence=now() + interval '24 hours' WHERE mesa=NEW.mesa AND NOT retirando;
  RETURN NEW;
END;
$$;
CREATE TRIGGER actividad_voz_turno AFTER INSERT ON juego.eventos_chico
  FOR EACH ROW EXECUTE FUNCTION juego.actividad_voz();
CREATE TRIGGER actividad_voz_asiento AFTER INSERT ON juego.asientos
  FOR EACH ROW EXECUTE FUNCTION juego.actividad_voz();

CREATE TABLE juego.voz_pausas (
  servidor text PRIMARY KEY,
  hasta timestamptz NOT NULL
);
