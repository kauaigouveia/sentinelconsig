# FACTA through Oracle fixed IPv4

Gateway host: `gateway.sentinelconsig.com.br`, public IPv4 `150.230.86.123`.

## Install

Prerequisites: Node 22, Nginx and a valid TLS certificate already installed for the gateway hostname. The existing Nginx site must be `/etc/nginx/sites-available/sentinel-gateway`. TCP 80/443 must be allowed in OCI and UFW. The secret must already exist in `/etc/sentinel-gateway/secret` (root only).

Copy the complete contents of `install.sh` into the Oracle Ubuntu terminal. The wrapper runs the installation as root. The installer preserves the certificate configuration, binds Node only to `127.0.0.1:3100`, and adds an HTTPS-only `/facta` location. The key is passed through a root-only systemd environment file and is never written into the repository or printed by the installer.

## Sentinel / Vercel configuration

Set these server environment variables for Production and redeploy:

```text
FACTA_GATEWAY_URL=https://gateway.sentinelconsig.com.br/facta
FACTA_GATEWAY_SECRET=<the existing Oracle secret>
```

Do not use the `VITE_` prefix. Copy the secret privately from the server into the protected environment-variable field; never paste it into chat or logs. The original FACTA base URL and tenant credentials remain the official provider configuration. The gateway is a separate transport, not a replacement provider base URL.

Without both gateway variables, the app retains its legacy direct transport. If either variable is set, both are required. A configured gateway never falls back to direct egress after a failure. Token authentication, product simulations, authorizations, and proposal status queries all use this transport. The gateway explicitly forces IPv4, accepts only the two official FACTA hosts and the used endpoint/method allowlist, does not follow redirects, and forwards only the necessary authorization and content headers. It does not log request payloads, keys or upstream responses.

## Operational validation still required

Installation status must be checked on Oracle. `/health` confirms Nginx/TLS only, not the Node service or provider credentials. Confirm that an unauthenticated POST to `/facta` returns 403. Then use the existing FACTA connection check in Sentinel after setting the variables and redeploying. A successful HTTP status alone is insufficient: provider JSON must indicate success. Finally verify a real simulation and a known proposal status query. Do not repeat authorization POSTs automatically.

Useful server diagnostics (no secret output):

```bash
sudo systemctl is-active sentinel-gateway
sudo journalctl -u sentinel-gateway -n 20 --no-pager
curl -4 -X POST -i https://gateway.sentinelconsig.com.br/facta
```

The manually applied `resolvectl` override in this session is temporary. Confirm normal DNS and certificate renewal after a reboot; no persistent network changes are applied by this installer.
