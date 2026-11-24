ALTER TABLE juego.mesas DROP CONSTRAINT mesas_version_senas_check,
  ADD CONSTRAINT mesas_version_senas_check CHECK (
    version_senas IS NULL OR
    (modo = '2v2' AND version_senas IN ('senas-publicas-v1', 'senas-equipo-v1')) OR
    (modo IN ('2v2','3v3') AND version_senas = 'senas-pie-v1')
  );

ALTER TABLE juego.manos DROP CONSTRAINT manos_version_senas_check,
  ADD CONSTRAINT manos_version_senas_check CHECK (
    version_senas IN ('senas-publicas-v1','senas-equipo-v1','senas-pie-v1')
  ),
  ADD COLUMN indicaciones jsonb NOT NULL DEFAULT '[]' CHECK (
    jsonb_typeof(indicaciones) = 'array' AND
    (indicaciones = '[]' OR version_senas IS NOT DISTINCT FROM 'senas-pie-v1')
  );

ALTER TABLE juego.turnos_bot ADD COLUMN disponible_desde timestamptz NOT NULL DEFAULT '-infinity';
