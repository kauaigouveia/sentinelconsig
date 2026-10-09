#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if (( EUID != 0 )); then
  echo 'Execute sudo bash install-dependencies.sh na NOVA instância.' >&2
  exit 1
fi
. /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 22.04 ]]; then
  echo 'Este instalador foi preparado para Ubuntu 22.04. Confira a versão antes de continuar.' >&2
  exit 1
fi
bash prepare-micro.sh --swap-only
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl nginx certbot python3-certbot-nginx
if command -v docker >/dev/null; then
  docker compose version >/dev/null || { echo 'Docker existente sem Compose. Não remover pacotes; conferir a instalação existente.' >&2; exit 1; }
else
  # Follow Docker's official signed Ubuntu repository instructions.
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/sentinel-docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker
docker compose version
echo 'Dependências instaladas. A Evolution ainda não foi iniciada.'
