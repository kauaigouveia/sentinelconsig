import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Add import
if (!content.includes('import { TenantSelectionView }')) {
  content = content.replace(
    "import { LoginView } from './components/auth/LoginView';",
    "import { LoginView } from './components/auth/LoginView';\nimport { TenantSelectionView } from './components/auth/TenantSelectionView';"
  );
}

// Check requireTenantSelection
const oldAuthCheck = `  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => verifyServerSession()} />;
  }`;

const newAuthCheck = `  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => verifyServerSession()} />;
  }

  if (activeUser?.requireTenantSelection) {
    return <TenantSelectionView user={activeUser} onSuccess={() => window.location.reload()} />;
  }`;

if (content.includes(oldAuthCheck) && !content.includes('TenantSelectionView user={activeUser}')) {
  content = content.replace(oldAuthCheck, newAuthCheck);
  console.log('App.tsx patched for TenantSelectionView');
}

fs.writeFileSync('src/App.tsx', content);
