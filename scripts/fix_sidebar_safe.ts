import fs from 'fs';

let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf-8');

// 1. Update SidebarProps
sidebar = sidebar.replace(
  'interface SidebarProps {\n  currentView: string;\n  onNavigate: (view: string) => void;\n}',
  'import { TenantBranding } from "../../hooks/useTenantBranding";\n\ninterface SidebarProps {\n  currentView: string;\n  onNavigate: (view: string) => void;\n  branding?: TenantBranding;\n}'
);

sidebar = sidebar.replace(
  'export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {',
  'export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, branding }) => {'
);

// 2. Override effectiveBranding with branding passed from App.tsx
sidebar = sidebar.replace(
  '  const effectiveBranding = resolveEffectiveTenantBranding(\n    activeUser,\n    currentTenant,\n    whiteLabel,\n    adminContext\n  );',
  '  let effectiveBranding = resolveEffectiveTenantBranding(\n    activeUser,\n    currentTenant,\n    whiteLabel,\n    adminContext\n  );\n\n  // Override with authoritative branding from server\n  if (branding && branding.status !== "DOMAIN_NOT_CONFIGURED") {\n    effectiveBranding.tenantName = branding.companyName || effectiveBranding.tenantName;\n    effectiveBranding.logoUrl = branding.logoUrl || effectiveBranding.logoUrl;\n    effectiveBranding.plan = branding.plan || effectiveBranding.plan;\n  }'
);

// 3. Fix main header logos to use SYSTEM_IDENTITY instead of effectiveBranding
sidebar = sidebar.replace(
  /src=\{effectiveBranding\.logoUrl \|\| SYSTEM_IDENTITY\.defaultLogo\}/g,
  'src={SYSTEM_IDENTITY.defaultLogo}'
);

// 4. Update the ENTERPRISE badge to use plan
sidebar = sidebar.replace(
  '{SYSTEM_IDENTITY.badge}',
  '{effectiveBranding.plan || SYSTEM_IDENTITY.badge}'
);

// 5. Fix the compact view ENT abbreviation
sidebar = sidebar.replace(
  '<span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">\n            ENT\n          </span>',
  '<span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">\n            {(effectiveBranding.plan || SYSTEM_IDENTITY.badge).substring(0, 3).toUpperCase()}\n          </span>'
);

fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);
console.log('Sidebar fixed');
