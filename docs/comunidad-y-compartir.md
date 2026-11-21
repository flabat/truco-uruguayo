# Comunidad y compartir

## Conteos

El registro web guarda el método, la ruta y el estado, sin IP ni parámetros. Algunas rutas existentes contienen tokens de invitación; protegé esos registros. Los archivos públicos de `/eventos/` cuentan interacciones sin agregar enlaces de invitación, nombres ni ID. Para consultar los registros conservados por Docker:

```sh
docker compose -f compose.production.yaml logs --no-log-prefix web | awk '$2 ~ /^\/eventos\/(discord|compartir-mesa|compartir-pagina|ingreso-mesa)\.txt$/ && $3 == 200 { n[$2]++ } END { for (ruta in n) print ruta, n[ruta] }'
```

Los conteos de compartir y Discord son clics en los controles, no entregas ni altas confirmadas. `ingreso-mesa` cuenta respuestas exitosas al ocupar asiento desde una invitación; no identifica personas ni permite atribuir cada ingreso a un clic. La retención depende de los registros de Docker, y los bloqueadores o una desconexión pueden omitir eventos; estos números son aproximados.
