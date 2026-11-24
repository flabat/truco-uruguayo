-- Cada pase pertenece a una mano, vuelta y compañero. No es una palabra pública del replay.
ALTER TABLE juego.manos ADD COLUMN pases_pie jsonb NOT NULL DEFAULT '[]' CHECK (
  jsonb_typeof(pases_pie) = 'array' AND
  (pases_pie = '[]' OR version_senas IS NOT DISTINCT FROM 'senas-pie-v1')
);
