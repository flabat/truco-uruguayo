CREATE TABLE juego.funciones (
  clave text PRIMARY KEY,
  audiencia text NOT NULL DEFAULT 'desactivado' CHECK (audiencia IN ('desactivado','seleccionados','todos')),
  jugadores uuid[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 0
);
INSERT INTO juego.funciones(clave) VALUES ('tercetos');

CREATE TABLE juego.cambios_funciones (
  clave text NOT NULL REFERENCES juego.funciones(clave),
  version integer NOT NULL,
  operador uuid NOT NULL REFERENCES juego.jugadores(id),
  fecha timestamptz NOT NULL DEFAULT now(),
  anterior text NOT NULL,
  audiencia text NOT NULL,
  jugadores_antes uuid[] NOT NULL,
  jugadores uuid[] NOT NULL,
  PRIMARY KEY (clave, version)
);
