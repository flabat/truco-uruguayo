-- Refresh token de Apple, cifrado con APPLE_TOKENS_KEY, para revocarlo al completar una baja.
CREATE TABLE juego.tokens_apple (
  jugador uuid PRIMARY KEY REFERENCES juego.jugadores(id),
  token text NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now()
);
