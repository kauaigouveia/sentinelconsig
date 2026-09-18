import fs from 'fs';

let content = fs.readFileSync('src/components/admin/UserManagement.tsx', 'utf-8');

// We can just add the import at the top
if (!content.includes('MembershipEditor')) {
  content = content.replace(
    "import { Tenant, User, Role, Permission } from '../../types';",
    "import { Tenant, User, Role, Permission } from '../../types';\nimport { MembershipEditor } from './MembershipEditor';"
  );
}

// In creation form, replace the old tenant dropdown with MembershipEditor if isPlatformMaster
const oldCreateTenant = `{isPlatformMaster ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Empresa</label>
                  <select
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    {tenants.length === 0 && <option value="">Selecione uma Empresa</option>}
                  </select>
                </div>
              ) : (`;

const newCreateTenant = `{isPlatformMaster ? (
                <div className="col-span-1 sm:col-span-4">
                  <MembershipEditor 
                    tenants={tenants} 
                    memberships={memberships} 
                    onChange={setMemberships} 
                  />
                </div>
              ) : (`;

if (content.includes(oldCreateTenant)) {
  content = content.replace(oldCreateTenant, newCreateTenant);
  console.log("Create tenant UI patched");
}

fs.writeFileSync('src/components/admin/UserManagement.tsx', content);
