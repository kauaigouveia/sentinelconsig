import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace(
  /availableMemberships:\s*\(typeof validMemberships !== 'undefined' \? validMemberships : \[\]\)\.map\(m => \(\{/g,
  "availableMemberships: (typeof validMemberships !== 'undefined' ? validMemberships : [] as any[]).map((m: any) => ({"
);
content = content.replace(
  /requireTenantSelection:\s*\(typeof validMemberships !== 'undefined' \? validMemberships\.length : 0\) > 1/g,
  "requireTenantSelection: (typeof validMemberships !== 'undefined' ? (validMemberships as any[]).length : 0) > 1"
);
fs.writeFileSync('server.ts', content);
console.log('Fixed TS errors in server.ts');
