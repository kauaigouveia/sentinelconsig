import fs from 'fs';

let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf-8');

// Replace compact version logo logic
sidebar = sidebar.replace(
  /\{whiteLabel\.logoUrl \? \([\s\S]*?\) : \([\s\S]*?\)\}/,
  '<img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />'
);

// Replace expanded version logo logic
sidebar = sidebar.replace(
  /\{whiteLabel\.logoUrl \? \([\s\S]*?\) : \([\s\S]*?\)\}/,
  '<img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />'
);

// Replace main header text with SYSTEM_IDENTITY
sidebar = sidebar.replace(
  /{whiteLabel\.companyName \|\| 'Sentinel Consig'}/g,
  '{SYSTEM_IDENTITY.name}'
);
sidebar = sidebar.replace(
  /{whiteLabel\.tradeName \|\| whiteLabel\.companyName \|\| 'SENTINEL CONSIG'}/g,
  '{SYSTEM_IDENTITY.subtitle}'
);
sidebar = sidebar.replace(
  />\s*ENTERPRISE\s*</,
  '>{effectiveBranding.plan || SYSTEM_IDENTITY.badge}<'
);

// Add logo to EMPRESA ATUAL block
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
console.log('Final fixes applied to Sidebar.tsx');
