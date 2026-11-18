import crypto from 'node:crypto';

/** Authorize a one-time serverless bootstrap only with the configured initial master credentials. */
export function shouldBootstrapInitialMaster(
  input: { email: string; password: string },
  config: { masterEmail?: string; masterPassword?: string },
): boolean {
  const email = (config.masterEmail || 'kauaigouveia@gmail.com').trim().toLowerCase();
  const password = config.masterPassword?.trim();
  if (!password || input.email.trim().toLowerCase() !== email) return false;
  const supplied = crypto.createHash('sha256').update(input.password).digest();
  const expected = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(supplied, expected);
}
