-- Pedido de eliminación de cuenta: 30 días para arrepentirse antes de borrar los datos personales.
CREATE TABLE juego.bajas (
  jugador uuid PRIMARY KEY REFERENCES juego.jugadores(id),
  pedida timestamptz NOT NULL DEFAULT now(),
  vence timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
