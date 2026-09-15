const fs = require('fs');
let content = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

if (!content.includes("view: 'admin-comunicados'")) {
  content = content.replace(
    "{ id: 'admin-status', label: 'Status & Regras', icon: Settings, view: 'admin-status' },",
    "{ id: 'admin-status', label: 'Status & Regras', icon: Settings, view: 'admin-status' },\n          { id: 'admin-comunicados', label: 'Comunicados', icon: Megaphone, view: 'admin-comunicados' },"
  );
  fs.writeFileSync('src/components/layout/Sidebar.tsx', content);
}
