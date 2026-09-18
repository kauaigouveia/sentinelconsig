import fs from 'fs';

let content = fs.readFileSync('src/components/admin/UserManagement.tsx', 'utf-8');
if (!content.includes('import { MembershipEditor }')) {
  content = content.replace(
    "import { Tenant, User, Role, Permission } from '../../types';",
    "import { Tenant, User, Role, Permission } from '../../types';\nimport { MembershipEditor } from './MembershipEditor';"
  );
  fs.writeFileSync('src/components/admin/UserManagement.tsx', content);
  console.log('Fixed UserManagement.tsx import');
}
