const key = 'sentinel.ui-development';
export function readDevelopmentPresentation(search: string): boolean {
  const mode = new URLSearchParams(search).get('ui');
  if (mode === '2') return true;
  if (mode === 'legacy') return false;
  try { return localStorage.getItem(key) === '2'; } catch { return false; }
}
export function rememberDevelopmentPresentation(enabled: boolean) {
  try { localStorage.setItem(key, enabled ? '2' : 'legacy'); } catch { /* Optional presentation preference. */ }
}
