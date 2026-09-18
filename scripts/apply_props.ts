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

sidebar = sidebar.replace(
  '>\n            ENT\n          <',
  '>\n            {(effectiveBranding.plan || SYSTEM_IDENTITY.badge).substring(0, 3).toUpperCase()}\n          <'
);


fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);
console.log('Props applied');
