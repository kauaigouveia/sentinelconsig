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

// 2. Override effectiveBranding
sidebar = sidebar.replace(
  '  const effectiveBranding = resolveEffectiveTenantBranding(\n    activeUser,\n    currentTenant,\n    whiteLabel,\n    adminContext\n  );',
  '  let effectiveBranding = resolveEffectiveTenantBranding(\n    activeUser,\n    currentTenant,\n    whiteLabel,\n    adminContext\n  );\n\n  // Override with authoritative branding from server\n  if (branding && branding.status !== "DOMAIN_NOT_CONFIGURED") {\n    effectiveBranding.tenantName = branding.companyName || effectiveBranding.tenantName;\n    effectiveBranding.logoUrl = branding.logoUrl || effectiveBranding.logoUrl;\n    effectiveBranding.plan = branding.plan || effectiveBranding.plan;\n  }'
);

// 3. Fix main header logos to use SYSTEM_IDENTITY instead of effectiveBranding/whiteLabel
// Compact logo
const compactLogoRegex = /\{whiteLabel\.logoUrl \? \([\s\S]*?\) : \([\s\S]*?\)\}/;
sidebar = sidebar.replace(
  compactLogoRegex,
  '<img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />'
);
// Expanded logo
const expandedLogoRegex = /\{whiteLabel\.logoUrl \? \([\s\S]*?\) : \([\s\S]*?\)\}/;
sidebar = sidebar.replace(
  expandedLogoRegex,
  '<img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />'
);

// 4. Update the ENTERPRISE badge to use plan
sidebar = sidebar.replace(
  '<span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 shrink-0 leading-none">\n                  ENTERPRISE\n                </span>',
  '<span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 shrink-0 leading-none">\n                  {effectiveBranding.plan || SYSTEM_IDENTITY.badge}\n                </span>'
);

// 5. Fix the compact view ENT abbreviation
sidebar = sidebar.replace(
  '<span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">\n            ENT\n          </span>',
  '<span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">\n            {(effectiveBranding.plan || SYSTEM_IDENTITY.badge).substring(0, 3).toUpperCase()}\n          </span>'
);

// 6. Fix text labels in headers
sidebar = sidebar.replace(
  /{whiteLabel\.companyName \|\| 'Sentinel Consig'}/g,
  '{SYSTEM_IDENTITY.name}'
);
sidebar = sidebar.replace(
  /{whiteLabel\.tradeName \|\| whiteLabel\.companyName \|\| 'SENTINEL CONSIG'}/g,
  '{SYSTEM_IDENTITY.subtitle}'
);

// 7. Add logo to EMPRESA ATUAL block
const oldTenantBlock = `<div
              className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate leading-snug"
              title={displayCompanyName}
            >
              {displayCompanyName}
            </div>`;

const newTenantBlock = `<div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 bg-white dark:bg-slate-800 shadow-xs border border-slate-200/50 dark:border-slate-700/50">
                <img 
                  src={effectiveBranding.logoUrl || SYSTEM_IDENTITY.defaultLogo} 
                  alt={effectiveBranding.tenantName} 
                  className="max-h-full max-w-full object-contain rounded-sm"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div
                className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate leading-snug flex-1"
                title={effectiveBranding.tenantName}
              >
                {effectiveBranding.tenantName}
              </div>
            </div>`;
sidebar = sidebar.replace(oldTenantBlock, newTenantBlock);

fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);
console.log('Sidebar fixed properly');
