import { resolveEffectiveTenantBranding, SYSTEM_IDENTITY } from './src/lib/branding';

const activeUser = { role: 'GESTOR', tenantId: 'cmu67cg0n0000jq04xfmtgh1e' };
const currentTenant = {
  id: 'cmu67cg0n0000jq04xfmtgh1e',
  name: 'GRUPO EVOLVE',
  plan: 'PRO'
};
const whiteLabel = null;

const effectiveBranding = resolveEffectiveTenantBranding(
  activeUser, currentTenant, whiteLabel, { active: false }
);

console.log('plan:', effectiveBranding.plan || SYSTEM_IDENTITY.badge);
