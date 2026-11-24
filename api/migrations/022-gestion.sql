CREATE INDEX asientos_por_jugador ON juego.asientos(jugador, mesa) WHERE jugador IS NOT NULL;
CREATE INDEX sesiones_por_jugador ON juego.sesiones(jugador, vence);

-- Solo tanteadores. Un escritor antiguo puede guardar acciones posteriores al último
-- evento del replay: una decisión solo certifica el tanteador de su posición exacta.
CREATE VIEW juego.marcadores_gestion AS
SELECT m.id, m.modo, m.meta, coalesce(h.numero, 0) AS mano, h.version,
       r.cabecera->>'inicio' AS inicio, c.evento->>'fecha' AS fin,
       CASE WHEN c.evento->>'estado' = 'terminado'
              THEN ARRAY[(c.evento->'puntos'->>0)::integer, (c.evento->'puntos'->>1)::integer]
            WHEN h.cantidad = 0 THEN h.puntos_inicio
            WHEN d.evento->>'tipo' = 'decision'
              THEN ARRAY[(d.evento->'puntos'->>0)::integer, (d.evento->'puntos'->>1)::integer]
       END AS puntos
  FROM juego.mesas m
  LEFT JOIN LATERAL (
    SELECT numero, version, puntos_inicio, jsonb_array_length(acciones) AS cantidad
      FROM juego.manos WHERE mesa=m.id ORDER BY numero DESC LIMIT 1
  ) h ON true
  LEFT JOIN juego.replays_chico r ON r.mesa=m.id
  LEFT JOIN juego.eventos_chico c ON c.mesa=m.id AND c.evento->>'tipo'='cierre'
  LEFT JOIN juego.eventos_chico d ON d.mesa=m.id AND d.mano=h.numero AND d.posicion=h.cantidad
 WHERE NOT m.solo_computadoras;
