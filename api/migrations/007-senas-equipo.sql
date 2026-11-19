ALTER TABLE juego.mesas DROP CONSTRAINT mesas_check,
  ADD CONSTRAINT mesas_version_senas_check CHECK (
    version_senas IS NULL OR (modo = '2v2' AND version_senas IN ('senas-publicas-v1','senas-equipo-v1'))
  );
ALTER TABLE juego.manos DROP CONSTRAINT manos_version_senas_check,
  ADD CONSTRAINT manos_version_senas_check CHECK (version_senas IN ('senas-publicas-v1','senas-equipo-v1'));

ALTER TABLE juego.artefactos DROP CONSTRAINT artefactos_formato_check,
  ADD CONSTRAINT artefactos_formato_check CHECK (formato IN ('duel','pairs','pairs-senas','pairs-private-senas'));
ALTER TABLE juego.activaciones DROP CONSTRAINT activaciones_formato_check,
  ADD CONSTRAINT activaciones_formato_check CHECK (formato IN ('duel','pairs','pairs-senas','pairs-private-senas'));
