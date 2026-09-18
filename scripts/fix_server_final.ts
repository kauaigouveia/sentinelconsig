import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf-8');

// Ensure variables exist
const header = "let validMemberships: any[] = [];\n      let hasDomainTenant = false;";
if (!content.includes(header)) {
  content = content.replace("const safeUser = {", header + "\n      const safeUser = {");
}

// Strip typeof checks
content = content.replace(
  /availableMemberships: \(typeof validMemberships !== 'undefined' \? validMemberships : \[\] as any\[\]\)\.map\(\(m: any\) => \(\{/g,
  "availableMemberships: validMemberships.map(m => ({"
);
content = content.replace(
  /availableMemberships: \(typeof validMemberships !== 'undefined' \? validMemberships : \[\]\)\.map\(m => \(\{/g,
  "availableMemberships: validMemberships.map(m => ({"
);
content = content.replace(
  /requireTenantSelection: \(typeof validMemberships !== 'undefined' \? \(validMemberships as any\[\]\)\.length : 0\) > 1 && !\(typeof hasDomainTenant !== 'undefined' && hasDomainTenant\) && !dbUser\.mustChangePassword,/g,
  "requireTenantSelection: validMemberships.length > 1 && !hasDomainTenant && !dbUser.mustChangePassword,"
);
content = content.replace(
  /requireTenantSelection: \(typeof validMemberships !== 'undefined' \? validMemberships\.length : 0\) > 1 && !\(typeof hasDomainTenant !== 'undefined' && hasDomainTenant\) && !dbUser\.mustChangePassword,/g,
  "requireTenantSelection: validMemberships.length > 1 && !hasDomainTenant && !dbUser.mustChangePassword,"
);

// In UserManagement.tsx, fix the MembershipEditor import if it's broken or just add it correctly.
let userMgmt = fs.readFileSync('src/components/admin/UserManagement.tsx', 'utf-8');
if (!userMgmt.includes('import { MembershipEditor }')) {
  userMgmt = "import { MembershipEditor } from './MembershipEditor';\n" + userMgmt;
  fs.writeFileSync('src/components/admin/UserManagement.tsx', userMgmt);
}

// In MembershipEditor.tsx, fix Permission import
let editor = fs.readFileSync('src/components/admin/MembershipEditor.tsx', 'utf-8');
editor = editor.replace(
  "import { Tenant, Role, Permission } from '../../types';",
  "import { Tenant, Role } from '../../types';"
);
fs.writeFileSync('src/components/admin/MembershipEditor.tsx', editor);

fs.writeFileSync('server.ts', content);
