/** All FACTA requests share the same optional fixed-egress transport. */
export async function factaFetch(target: string | URL, init: RequestInit = {}): Promise<Response> {
  const gateway = process.env.FACTA_GATEWAY_URL?.trim();
  const secret = process.env.FACTA_GATEWAY_SECRET?.trim();
  if (!gateway && !secret) return fetch(target, init);
  if (!gateway || !secret) throw new Error('Configure FACTA_GATEWAY_URL e FACTA_GATEWAY_SECRET juntas.');
  const endpoint = new URL(gateway);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/facta') {
    throw new Error('FACTA_GATEWAY_URL deve ser um endereço HTTPS terminado em /facta.');
  }
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['webservice.facta.com.br', 'webservice-homol.facta.com.br'].includes(url.hostname)) {
    throw new Error('Destino FACTA não permitido pelo gateway.');
  }
  if (init.body != null && typeof init.body !== 'string') throw new Error('Corpo FACTA deve ser texto serializado.');
  const headers = new Headers(init.headers);
  const forwardedHeaders: Record<string, string> = {};
  for (const name of ['authorization', 'accept', 'content-type']) {
    const value = headers.get(name);
    if (value) forwardedHeaders[name] = value;
  }
  const response = await fetch(endpoint, {
    method: 'POST', signal: init.signal, redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Key': secret },
    body: JSON.stringify({ url: url.href, method: init.method || 'GET', headers: forwardedHeaders, body: init.body }),
  });
  // Gateway failures are distinct from provider credential failures; never fall back to direct egress.
  if (response.headers.get('x-sentinel-gateway-error') === '1') {
    throw new Error(`Gateway FACTA indisponível ou configuração inválida (HTTP ${response.status}).`);
  }
  return response;
}
