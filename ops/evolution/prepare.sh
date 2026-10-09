#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
memory_kb=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
if (( memory_kb < 3500000 )); then
  echo 'A instalação exige pelo menos 4 GB de RAM nesta configuração. Amplie a instância ou use outro servidor.' >&2
  exit 1
fi
command -v docker >/dev/null || { echo 'Instale Docker e o plugin Compose antes de continuar.' >&2; exit 1; }
docker compose version >/dev/null
if [[ -e .env ]]; then
  echo 'O arquivo .env já existe. Ele foi preservado. Use docker compose up -d para iniciar.'
  exit 0
fi
umask 077
api_key=$(openssl rand -hex 32)
db_password=$(openssl rand -hex 32)
# Resolve the official image once; subsequent starts keep this exact digest.
docker pull evoapicloud/evolution-api:latest
image_digest=$(docker image inspect evoapicloud/evolution-api:latest --format '{{index .RepoDigests 0}}')
sed -e "s|^EVOLUTION_IMAGE=.*|EVOLUTION_IMAGE=$image_digest|" \
    -e "s|^AUTHENTICATION_API_KEY=.*|AUTHENTICATION_API_KEY=$api_key|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$db_password|" .env.example > .env
chmod 600 .env
echo 'Configuração criada. As chaves ficaram apenas no arquivo .env protegido.'
echo 'Confira SERVER_URL no arquivo antes de iniciar com docker compose up -d.'
