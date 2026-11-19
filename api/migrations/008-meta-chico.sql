ALTER TABLE juego.mesas ADD COLUMN meta integer NOT NULL DEFAULT 40
  CHECK (meta >= 2 AND meta % 2 = 0);
