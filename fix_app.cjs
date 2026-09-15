const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Ensure AnnouncementsManagement was imported properly
if (content.includes('AnnouncementsManagement') && content.includes('view === \'admin-comunicados\'')) {
  console.log('App.tsx is correct.');
}
