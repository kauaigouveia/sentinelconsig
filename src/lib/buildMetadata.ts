export interface PublicBuildMetadata { revision: string | null; builtAt: string | null }
declare const __SENTINEL_BUILD__: PublicBuildMetadata;

export const publicBuildMetadata: PublicBuildMetadata = typeof __SENTINEL_BUILD__ === 'undefined'
  ? { revision: null, builtAt: null }
  : __SENTINEL_BUILD__;
