-- Las salas existentes conservan su chat. Cada alta posterior publica su propio botón.
ALTER TABLE juego.voz_discord
  ADD COLUMN regreso_publicado boolean NOT NULL DEFAULT true,
  ADD COLUMN intento_regreso timestamptz;
ALTER TABLE juego.voz_discord ALTER COLUMN regreso_publicado SET DEFAULT false;
