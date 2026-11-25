# Carga los puertos de la ranura de este worktree (npm run trabajo) sin pisar variables ya definidas.
# Se incluye con `source` desde la raíz del checkout. Sin .env.trabajo, no hace nada.
if [[ -f .env.trabajo ]]; then
  while IFS='=' read -r clave valor; do
    [[ $clave =~ ^[A-Z_][A-Z0-9_]*$ && -z ${!clave+x} ]] && export "$clave=$valor"
  done < .env.trabajo
fi
true
