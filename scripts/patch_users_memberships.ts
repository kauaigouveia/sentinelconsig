import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// The best way to patch a large file with complex changes is just rewriting the endpoints.
// We will replace POST /api/users and PUT /api/users/:id.

const postUsersOld = `  app.post('/api/users', async (req, res) => {`;
// ... wait, rewriting with regex might be dangerous.
// Let's use string splitting.
