#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
echo 'Memória e swap:'
free -h
echo 'Disco:'
df -h /
echo 'Containers:'
docker compose -f compose.yaml -f compose.micro.yaml ps -a
for service in api postgres redis; do
  container_id=$(docker compose -f compose.yaml -f compose.micro.yaml ps -aq "$service")
  if [[ -n "$container_id" ]]; then
    docker inspect --format '{{.Name}} state={{.State.Status}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} restarts={{.RestartCount}}' "$container_id"
  fi
done
container_ids=$(docker compose -f compose.yaml -f compose.micro.yaml ps -q)
if [[ -n "$container_ids" ]]; then
  # Container IDs are produced by Docker, never user-supplied text.
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $container_ids
fi
# Only show readiness status. Never print API responses, credentials or QR codes.
if command -v curl >/dev/null; then
  curl -sS -o /dev/null -w 'Evolution local: HTTP %{http_code}\n' --connect-timeout 3 --max-time 5 http://127.0.0.1:8081/ || true
fi
