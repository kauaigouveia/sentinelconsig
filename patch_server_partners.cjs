const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// Fix GET /api/partners
content = content.replace(
  `const login = code ? (code.includes('@') ? code : \`\${fullName}@\${code}\`) : fullName;`,
  `const login = code || fullName;`
);

// Fix POST /api/partners response
content = content.replace(
  `const loginStr = codeStr ? (codeStr.includes('@') ? codeStr : \`\${created.name}@\${codeStr}\`) : created.name;`,
  `const loginStr = codeStr || created.name;`
);

fs.writeFileSync('server.ts', content);
