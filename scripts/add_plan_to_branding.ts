import fs from 'fs';

// 1. Update server/utils/tenantResolver.ts
let resolver = fs.readFileSync('server/utils/tenantResolver.ts', 'utf-8');

// Add plan to interface
if (!resolver.includes('plan?: string;')) {
  resolver = resolver.replace(
    '  tradeName?: string;',
    '  tradeName?: string;\n  plan?: string;'
  );
}

// Add plan to all tenant-specific branding objects
const planReplaces = [
  { search: "tenantId: tenant.id,", replace: "tenantId: tenant.id,\n            plan: tenant.plan," },
  { search: "tenantId: legacyTenant.id,", replace: "tenantId: legacyTenant.id,\n              plan: legacyTenant.plan," },
  { search: "companyName: wl?.companyName || tenant.name,", replace: "plan: tenant.plan,\n              companyName: wl?.companyName || tenant.name," },
  { search: "companyName: wl?.companyName || tenantDomain.tenant.name,", replace: "plan: tenantDomain.tenant.plan,\n              companyName: wl?.companyName || tenantDomain.tenant.name," },
  { search: "companyName: wl?.companyName || legacyTenant.name,", replace: "plan: legacyTenant.plan,\n              companyName: wl?.companyName || legacyTenant.name," }
];

planReplaces.forEach(r => {
  resolver = resolver.replace(r.search, r.replace);
});

fs.writeFileSync('server/utils/tenantResolver.ts', resolver);

// 2. Update src/hooks/useTenantBranding.ts
let useTenantBranding = fs.readFileSync('src/hooks/useTenantBranding.ts', 'utf-8');
if (!useTenantBranding.includes('plan?: string;')) {
  useTenantBranding = useTenantBranding.replace(
    '  legalName?: string;',
    '  legalName?: string;\n  plan?: string;'
  );
  fs.writeFileSync('src/hooks/useTenantBranding.ts', useTenantBranding);
}

// 3. Update src/lib/branding.ts
let brandingTs = fs.readFileSync('src/lib/branding.ts', 'utf-8');
if (!brandingTs.includes('plan?: string | null;')) {
  brandingTs = brandingTs.replace(
    '  logoUrl: string | null;',
    '  logoUrl: string | null;\n  plan?: string | null;'
  );
  // Add plan logic
  brandingTs = brandingTs.replace(
    'const finalLogoUrl = logoUrl || SYSTEM_IDENTITY.defaultLogo;',
    'const finalLogoUrl = logoUrl || SYSTEM_IDENTITY.defaultLogo;\n  let plan = whiteLabel?.plan || currentTenant?.plan || null;'
  );
  brandingTs = brandingTs.replace(
    'logoUrl: finalLogoUrl,',
    'logoUrl: finalLogoUrl,\n    plan,'
  );
  fs.writeFileSync('src/lib/branding.ts', brandingTs);
}

// 4. Update src/components/layout/Sidebar.tsx
let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf-8');
sidebar = sidebar.replace('{SYSTEM_IDENTITY.badge}', '{effectiveBranding.plan || SYSTEM_IDENTITY.badge}');
fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);

// 5. Update src/types/index.ts -> TenantPlan if needed
// Actually, it's just a string, so it should be fine.

console.log('Added plan to branding.');
