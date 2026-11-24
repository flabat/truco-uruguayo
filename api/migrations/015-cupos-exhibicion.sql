ALTER TABLE juego.cupos_exhibicion
  DROP CONSTRAINT cupos_exhibicion_numero_check,
  ADD CONSTRAINT cupos_exhibicion_numero_check CHECK (numero BETWEEN 1 AND 10);

-- Se conservan los cupos originales y sus plazos de recuperación.
INSERT INTO juego.cupos_exhibicion (numero) SELECT generate_series(7, 10);
