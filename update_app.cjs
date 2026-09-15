const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
if (!content.includes('AnnouncementsManagement')) {
  content = content.replace(
    "import { TenantSaaSCapacityView } from './components/admin/TenantSaaSCapacityView';",
    "import { TenantSaaSCapacityView } from './components/admin/TenantSaaSCapacityView';\nimport { AnnouncementsManagement } from './components/admin/AnnouncementsManagement';"
  );
}

// Add view
if (!content.includes("view === 'admin-comunicados'")) {
  content = content.replace(
    "{currentView === 'admin-import-status' && (",
    "{currentView === 'admin-comunicados' && (<AnnouncementsManagement />)}\n          {currentView === 'admin-import-status' && ("
  );
}

fs.writeFileSync('src/App.tsx', content);
