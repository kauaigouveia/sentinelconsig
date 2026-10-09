#!/usr/bin/env bash
sudo bash <<'SENTINEL_GATEWAY_INSTALL'
set -euo pipefail
# Run this entire script in the Oracle Ubuntu terminal. It never prints the secret.
if [ "$(id -u)" -ne 0 ]; then
  echo 'Execute este script com sudo bash.' >&2
  exit 1
fi
test -s /etc/sentinel-gateway/secret
command -v node >/dev/null
test -f /etc/nginx/sites-available/sentinel-gateway
if ! id sentinel-gateway >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin sentinel-gateway
fi
install -d -m 755 /opt/sentinel-gateway
cat > /opt/sentinel-gateway/server.cjs <<'NODE'
'use strict';
const http = require('node:http');
const https = require('node:https');
const { timingSafeEqual } = require('node:crypto');
const key = Buffer.from(process.env.GATEWAY_SECRET || '');
if (key.length < 32) throw new Error('Gateway secret missing');
const routes = new Map([
  ['/gera-token', ['GET']],
  ['/proposta/andamento-propostas', ['GET']],
  ['/proposta/operacoes-disponiveis', ['GET']],
  ['/proposta/contratos-refinanciamento', ['GET']],
  ['/fgts/saldo', ['GET']],
  ['/fgts/calculo', ['GET', 'POST']],
  ['/comercial/tabelas-coeficientes', ['GET']],
  ['/solicita-autorizacao-consulta', ['GET', 'POST']],
  ['/consignado-trabalhador/autoriza-consulta', ['GET', 'POST']],
  ['/consignado-trabalhador/analise-politica-credito', ['GET', 'POST']],
]);
const agent = new https.Agent({ keepAlive: true, maxSockets: 20, family: 4 });
function fail(res, status) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Sentinel-Gateway-Error': '1' });
  res.end(JSON.stringify({ error: 'Gateway request failed', status }));
}
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/facta') return fail(res, 404);
  const supplied = Buffer.from(String(req.headers['x-gateway-key'] || ''));
  if (supplied.length !== key.length || !timingSafeEqual(supplied, key)) return fail(res, 403);
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 262144) { fail(res, 413); return; }
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const url = new URL(input.url);
    const method = input.method;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !['webservice.facta.com.br', 'webservice-homol.facta.com.br'].includes(url.hostname) ||
        !routes.get(url.pathname)?.includes(method) ||
        (input.body != null && typeof input.body !== 'string') ||
        (method === 'GET' && input.body != null)) return fail(res, 400);
    const headers = { accept: 'application/json' };
    for (const name of ['authorization', 'accept', 'content-type']) {
      const value = input.headers?.[name];
      if (value != null) {
        if (typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 8192) return fail(res, 400);
        headers[name] = value;
      }
    }
    if (!/^(Basic|Bearer) \S+$/i.test(headers.authorization || '')) return fail(res, 400);
    const body = input.body || '';
    if (body) headers['content-length'] = Buffer.byteLength(body);
    const upstream = https.request(url, { method, headers, agent, family: 4 }, response => {
      const returned = [];
      let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 2097152) { response.destroy(); upstream.destroy(); fail(res, 502); }
        else returned.push(chunk);
      });
      response.on('error', () => fail(res, 502));
      response.on('end', () => {
        if (res.writableEnded || res.destroyed) return;
        // No redirects, cookies or provider headers are forwarded.
        res.writeHead(response.statusCode || 502, {
          'Content-Type': response.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(Buffer.concat(returned));
      });
    });
    const deadline = setTimeout(() => { upstream.destroy(); fail(res, 504); }, 28000);
    upstream.on('close', () => clearTimeout(deadline));
    upstream.on('error', () => fail(res, 502));
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    upstream.end(body);
  } catch { fail(res, 400); }
});
server.requestTimeout = 35000;
server.headersTimeout = 10000;
server.listen(3100, '127.0.0.1');
NODE
chmod 644 /opt/sentinel-gateway/server.cjs
umask 077
printf 'GATEWAY_SECRET=%s\n' "$(cat /etc/sentinel-gateway/secret)" > /etc/sentinel-gateway/gateway.env
cat > /etc/systemd/system/sentinel-gateway.service <<'UNIT'
[Unit]
Description=Sentinel FACTA fixed IPv4 gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sentinel-gateway
Group=sentinel-gateway
EnvironmentFile=/etc/sentinel-gateway/gateway.env
ExecStart=/usr/bin/node /opt/sentinel-gateway/server.cjs
Restart=on-failure
RestartSec=5
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
# Retain the TLS certificate configuration generated by Certbot.
cp -n /etc/nginx/sites-available/sentinel-gateway /etc/nginx/sites-available/sentinel-gateway.before-facta || true
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/sentinel-gateway')
s = p.read_text()
if 'location = /facta' not in s:
    marker = '    location / {'
    if marker not in s:
        raise SystemExit('Configuracao Nginx inesperada. Nenhuma alteracao aplicada.')
    block = '''    location = /facta {
        if ($scheme != "https") { return 403; }
        client_max_body_size 256k;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 35s;
        proxy_connect_timeout 5s;
        access_log off;
    }

'''
    p.write_text(s.replace(marker, block + marker, 1))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now sentinel-gateway
systemctl restart sentinel-gateway
systemctl reload nginx
systemctl is-active sentinel-gateway
echo 'Gateway instalado. Falta configurar as variaveis do Sentinel e validar a FACTA.'
SENTINEL_GATEWAY_INSTALL
