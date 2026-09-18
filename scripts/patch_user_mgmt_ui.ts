import fs from 'fs';

let content = fs.readFileSync('src/components/admin/UserManagement.tsx', 'utf-8');

// Replace states
const oldStates = `  const [role, setRole] = useState<Role>('DIGITADOR');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [showPermissionSelector, setShowPermissionSelector] = useState(false);`;

const newStates = `  const [role, setRole] = useState<Role>('DIGITADOR');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [showPermissionSelector, setShowPermissionSelector] = useState(false);
  const [memberships, setMemberships] = useState<any[]>([]);`;

if (content.includes(oldStates)) {
  content = content.replace(oldStates, newStates);
  console.log('States patched');
}

// In handleCreateUser
const oldCreatePayload = `          role,
          tenantId: selectedTenantId || undefined,
          customPermissions: selectedPermissions,`;

const newCreatePayload = `          role,
          tenantId: selectedTenantId || undefined,
          customPermissions: selectedPermissions,
          memberships,`;

if (content.includes(oldCreatePayload)) {
  content = content.replace(oldCreatePayload, newCreatePayload);
  console.log('Create payload patched');
}

// In handleUpdateUser
const oldUpdatePayload = `          role: editRole,
          tenantId: editTenantId || undefined,
          customPermissions: editPermissions,
          active: editActive,`;

const newUpdatePayload = `          role: editRole,
          tenantId: editTenantId || undefined,
          customPermissions: editPermissions,
          active: editActive,
          memberships,`;

if (content.includes(oldUpdatePayload)) {
  content = content.replace(oldUpdatePayload, newUpdatePayload);
  console.log('Update payload patched');
}

fs.writeFileSync('src/components/admin/UserManagement.tsx', content);
