ALTER TABLE juego.mesas
  ADD COLUMN version_senas text CHECK (version_senas IS NULL OR (modo = '2v2' AND version_senas = 'senas-publicas-v1')),
  ADD COLUMN solo_computadoras boolean NOT NULL DEFAULT false,
  ADD COLUMN ensayo_terminado boolean NOT NULL DEFAULT false CHECK (NOT ensayo_terminado OR solo_computadoras);

CREATE INDEX mesas_ensayo_pendiente ON juego.mesas(id) WHERE solo_computadoras AND NOT ensayo_terminado;

-- Las acciones históricas siguen siendo comandos silenciosos en su formato original.
ALTER TABLE juego.manos ADD COLUMN version_senas text CHECK (version_senas IS NULL OR version_senas = 'senas-publicas-v1');
