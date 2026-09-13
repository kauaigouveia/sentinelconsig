const fs = require('fs');
let content = fs.readFileSync('src/services/realtimeService.ts', 'utf8');
content = content.replace(/import\.meta\.env/g, '(import.meta as any).env');
fs.writeFileSync('src/services/realtimeService.ts', content);
