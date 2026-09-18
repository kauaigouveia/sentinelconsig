import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// Remove any existing let declarations
content = content.replace("let validMemberships: any[] = [];\n      let hasDomainTenant = false;", "");

// Re-add them right after the try { in POST /api/auth/login
const oldLoginStart = `  app.post('/api/auth/login', async (req, res) => {
    try {`;

const newLoginStart = `  app.post('/api/auth/login', async (req, res) => {
    try {
      let validMemberships: any[] = [];
      let hasDomainTenant = false;`;

if (content.includes(oldLoginStart)) {
  content = content.replace(oldLoginStart, newLoginStart);
}

fs.writeFileSync('server.ts', content);
console.log('Fixed var scope in server.ts');
