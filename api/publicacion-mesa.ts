// La sobremesa permite volver al mismo canal durante los 30 minutos posteriores al chico.
export const disponibleParaVoz = `m.publica AND m.ultimo_hecho_publico IS NOT NULL
  AND m.modo IN ('1v1','2v2') AND NOT m.exhibicion_retirada
  AND (EXISTS (SELECT 1 FROM juego.mesas_en_juego v WHERE v.id=m.id)
    OR m.fin_publico >= statement_timestamp() - interval '30 minutes')`;
