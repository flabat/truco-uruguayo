CREATE TABLE juego.reporteros (
  jugador uuid PRIMARY KEY REFERENCES juego.jugadores(id) ON DELETE CASCADE
);

-- La referencia privada identifica la pantalla mostrada, incluso si la mesa sigue jugando.
CREATE TABLE juego.reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa uuid NOT NULL,
  mano integer NOT NULL,
  posicion integer NOT NULL CHECK (posicion >= 0),
  secuencia bigint CHECK (secuencia > 0),
  asiento smallint NOT NULL,
  vuelta smallint NOT NULL CHECK (vuelta BETWEEN 1 AND 3),
  puntos text NOT NULL CHECK (puntos ~ '^[0-9]{1,10}-[0-9]{1,10}$'),
  fase text NOT NULL CHECK (fase IN ('presentacion', 'jugada', 'resultado')),
  cliente text NOT NULL CHECK (cliente = '' OR cliente ~ '^[a-f0-9]{40}$'),
  voz smallint CHECK (voz BETWEEN 0 AND 6),
  duelo smallint CHECK (duelo BETWEEN 1 AND 3),
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (mesa, mano) REFERENCES juego.manos(mesa, numero) ON DELETE CASCADE,
  FOREIGN KEY (mesa, asiento) REFERENCES juego.asientos(mesa, asiento) ON DELETE CASCADE,
  CONSTRAINT reportes_pantalla UNIQUE NULLS NOT DISTINCT
    (mesa, mano, posicion, asiento, vuelta, puntos, fase, cliente, voz, duelo)
);
