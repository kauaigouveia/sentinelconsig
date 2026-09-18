import fs from 'fs';

let content = fs.readFileSync('src/components/admin/UserManagement.tsx', 'utf-8');

// The best way is to locate the form and inject a MembershipManager component.
// First, let's add `memberships` state to creation and edit flows.

content = content.replace(
  "const [showPermissionSelector, setShowPermissionSelector] = useState(false);",
  "const [showPermissionSelector, setShowPermissionSelector] = useState(false);\n  const [memberships, setMemberships] = useState<any[]>([]);"
);

content = content.replace(
  "const [editPermissions, setEditPermissions] = useState<Permission[]>([]);",
  "const [editPermissions, setEditPermissions] = useState<Permission[]>([]);\n  const [editMemberships, setEditMemberships] = useState<any[]>([]);"
);

content = content.replace(
  "setEditPermissions(user.customPermissions || []);",
  "setEditPermissions(user.customPermissions || []);\n      setEditMemberships(user.memberships || []);"
);

content = content.replace(
  "role: editRole,",
  "role: editRole,\n          memberships: editMemberships,"
);

fs.writeFileSync('src/components/admin/UserManagement.tsx', content);
