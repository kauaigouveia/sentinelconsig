#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if (( EUID != 0 )); then
  echo 'Execute sudo bash prepare-micro.sh na NOVA instância exclusiva do WhatsApp.' >&2
  exit 1
fi
if [[ -d /etc/sentinel-gateway ]] || systemctl cat sentinel-gateway.service >/dev/null 2>&1; then
  echo 'Este servidor possui o gateway bancário. Use a segunda instância exclusiva do WhatsApp.' >&2
  exit 1
fi
memory_kb=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
if (( memory_kb < 850000 )); then
  echo 'Memória física abaixo de 850 MB; não iniciar esta composição.' >&2
  exit 1
fi
swap_kb=$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)
if (( swap_kb < 1900000 )); then
  swap_file=/swap-sentinel-evolution
  if [[ -e "$swap_file" || -L "$swap_file" ]]; then
    echo 'Já existe /swap-sentinel-evolution, mas há menos de 2 GB de swap ativos. Confira swapon --show antes de continuar.' >&2
    exit 1
  fi
  free_kb=$(df --output=avail -k / | tail -n 1 | tr -d ' ')
  if (( free_kb < 10000000 )); then
    echo 'São necessários pelo menos 10 GB livres antes da preparação.' >&2
    exit 1
  fi
  umask 077
  fallocate -l 2G "$swap_file"
  chmod 600 "$swap_file"
  mkswap "$swap_file" >/dev/null
  swapon "$swap_file"
  if ! grep -q '^/swap-sentinel-evolution[[:space:]]' /etc/fstab; then
    printf '\n/swap-sentinel-evolution none swap sw 0 0\n' >> /etc/fstab
  fi
fi
mkdir -p /etc/sysctl.d
printf 'vm.swappiness=30\n' > /etc/sysctl.d/90-sentinel-evolution-micro.conf
sysctl -p /etc/sysctl.d/90-sentinel-evolution-micro.conf >/dev/null
if [[ "${1:-}" == --swap-only ]]; then
  echo 'Swap preparado. Nenhum container foi iniciado.'
  exit 0
fi
command -v docker >/dev/null || { echo 'Instale Docker e Compose antes de continuar.' >&2; exit 1; }
docker compose version >/dev/null
SENTINEL_EVOLUTION_PROFILE=micro bash prepare.sh
docker compose -f compose.yaml -f compose.micro.yaml config --quiet
echo 'Perfil Micro preparado; nenhum container foi iniciado.'
echo 'Swap dá margem para picos, mas não substitui RAM. Estabilidade em 1 GB ainda precisa ser validada.'
echo 'Inicie: sudo docker compose -f compose.yaml -f compose.micro.yaml up -d'
