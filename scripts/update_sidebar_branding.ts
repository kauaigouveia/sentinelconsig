import fs from 'fs';

// 1. Update SidebarProps
let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf-8');
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

fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);

// 3. Update App.tsx to pass branding
let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');
appTsx = appTsx.replace(
  '<Sidebar currentView={currentView} onNavigate={handleNavigate} />',
  '<Sidebar currentView={currentView} onNavigate={handleNavigate} branding={branding} />'
);

fs.writeFileSync('src/App.tsx', appTsx);

console.log('Sidebar and App.tsx updated');
