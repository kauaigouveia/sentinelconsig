#!/usr/bin/env bash
# Execute only after reviewing the existing Oracle services. Does not touch FACTA/Daycoval.
set -euo pipefail
test "$(id -u)" -eq 0
test -s /etc/sentinel-gateway/secret
test -f /etc/nginx/sites-available/sentinel-gateway
command -v node >/dev/null
id sentinel-gateway >/dev/null
test -f "$(dirname "$0")/server.cjs"
test ! -e /opt/sentinel-vctex
test ! -e /etc/systemd/system/sentinel-vctex.service
if ss -ltn | awk '{print $4}' | grep -qE ':3101$'; then echo 'Port 3101 in use; interrupted.' >&2; exit 1; fi
install -d -m 755 /opt/sentinel-vctex
install -m 644 "$(dirname "$0")/server.cjs" /opt/sentinel-vctex/server.cjs
umask 077
printf 'GATEWAY_SECRET=%s\n' "$(cat /etc/sentinel-gateway/secret)" > /opt/sentinel-vctex/gateway.env
cat > /etc/systemd/system/sentinel-vctex.service <<'UNIT'
[Unit]
Description=Sentinel VCTEX fixed IPv4 transport
After=network-online.target
[Service]
User=sentinel-gateway
Group=sentinel-gateway
EnvironmentFile=/opt/sentinel-vctex/gateway.env
ExecStart=/usr/bin/node /opt/sentinel-vctex/server.cjs
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
MemoryMax=256M
TasksMax=64
[Install]
WantedBy=multi-user.target
UNIT
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/nginx/sites-available/sentinel-gateway')
s=p.read_text()
if 'location = /vctex' in s: raise SystemExit('VCTEX route already present: inspect it, do not overwrite.')
marker='    location / {'
if marker not in s: raise SystemExit('Unexpected Nginx layout: interrupted.')
backup=p.with_name(p.name+'.before-vctex')
if backup.exists(): raise SystemExit('Backup already exists: inspect before retry.')
backup.write_text(s)
p.write_text(s.replace(marker,'''    location = /vctex {
        if ($scheme != "https") { return 403; }
        client_max_body_size 64k;
        proxy_pass http://127.0.0.1:3101;
        proxy_connect_timeout 5s;
        proxy_read_timeout 28s;
        access_log off;
    }

'''+marker,1))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now sentinel-vctex
systemctl reload nginx
systemctl is-active sentinel-vctex
