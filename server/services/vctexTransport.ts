import { journeyFetch } from './cltJourneyDeadline.js';

export const VCTEX_ORIGIN = 'https://www.appvctex.com.br';
export function vctexTargetAllowed(method: string, target: string) {
  const u = new URL(target);
  if (u.origin !== VCTEX_ORIGIN || u.username || u.password || u.hash || /%|\\/.test(u.pathname)) return false;
  if (u.pathname === '/api/authentication/login') return method === 'POST' && !u.search;
  const p = u.pathname.replace(/^\/api\/consignado/, '');
  if (!u.pathname.startsWith('/api/consignado/')) return false;
  if (method === 'GET') return /^\/pre-operation(?:\/document-number\/\d{11}|\/[A-Za-z0-9-]+(?:\/employment\/[A-Za-z0-9-]+\/available-rates)?)?$/.test(p)
    && [...u.searchParams.keys()].every(k => ['documentNumber','page','perPage','preOperationList'].includes(k));
  return method === 'POST' && !u.search && (p === '/pre-operation' || p === '/pre-operation/external' || /^\/pre-operation\/[A-Za-z0-9-]+\/employment\/[A-Za-z0-9-]+\/simulate\/(full|installments)$/.test(p));
}
export function vctexGateway() {
  const raw = process.env.VCTEX_GATEWAY_URL, secret = process.env.VCTEX_GATEWAY_SECRET;
  if (!raw || !secret || secret.length < 32) throw Error('VCTEX: configure o transporte Oracle autenticado no backend.');
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/vctex' || u.port) throw Error('Gateway VCTEX deve usar HTTPS e a rota /vctex.');
  return { url: u, secret };
}
/** No direct-egress fallback, including login. Oracle enforces the same allowlist independently. */
export async function vctexFetch(target: string, init: RequestInit = {}) {
  const method = init.method || 'GET';
  if (!vctexTargetAllowed(method, target) || init.body != null && typeof init.body !== 'string') throw Error('Operação VCTEX não autorizada.');
  const gateway = vctexGateway(), source = new Headers(init.headers), headers: Record<string,string> = {};
  for (const key of ['authorization','accept','content-type']) if (source.has(key)) headers[key] = source.get(key)!;
  const response = await journeyFetch(gateway.url, {
    method: 'POST', redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
    headers: {'Content-Type':'application/json','X-Gateway-Key':gateway.secret},
    body: JSON.stringify({url:target,method,headers,body:init.body}),
  });
  if (response.headers.get('x-sentinel-gateway-error') === '1') throw Error(`Gateway Oracle VCTEX indisponível (HTTP ${response.status}).`);
  if (response.status >= 300 && response.status < 400) throw Error('Redirecionamento VCTEX bloqueado.');
  return response;
}
