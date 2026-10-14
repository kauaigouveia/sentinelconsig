export function normalizeFactaBaseUrl(raw: string, environment: 'production' | 'homologation'): string {
  const fallback = environment === 'production' ? 'https://webservice.facta.com.br' : 'https://webservice-homol.facta.com.br';
  if (!raw.trim()) return fallback;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('URL base FACTA inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error('Use uma URL base HTTPS oficial da FACTA, sem credenciais ou parâmetros.');
  // Legacy proposal-system addresses identify the environment, never an upstream destination.
  if (['proposta.facta.com.br', 'desenvolvimento.facta.com.br'].includes(url.hostname)) return fallback;
  if (!['webservice.facta.com.br', 'webservice-homol.facta.com.br'].includes(url.hostname) || url.pathname.replace(/\/+$/, '') !== '') throw new Error('Use https://webservice.facta.com.br ou https://webservice-homol.facta.com.br como URL base da FACTA.');
  return url.origin;
}
