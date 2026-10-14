import { readDevelopmentPresentation } from './developmentPresentation';

export function initialPresentation(development: boolean, mode: string | undefined, search: string): boolean {
  if (development) return readDevelopmentPresentation(search);
  // Production never accepts query/local-storage overrides from the development gallery.
  return mode !== 'legacy';
}

export function canSwitchProductionPresentation(authenticated: boolean, role: string | undefined, mode: string | undefined): boolean {
  return authenticated && mode !== 'legacy' && (role === 'MASTER' || role === 'PLATFORM_MASTER');
}
