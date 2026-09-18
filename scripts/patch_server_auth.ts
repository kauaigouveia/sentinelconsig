import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// Patch 1: Make /api/auth/login check memberships
// Find login endpoint
const loginMatch = content.match(/const cleanEmail = String\(email\)\.trim\(\)\.toLowerCase\(\);\s+const cleanPassword = String\(password\)\.trim\(\);/);
if (loginMatch) {
  console.log("Found login match");
}
