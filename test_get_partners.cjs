const http = require('http');

http.get('http://localhost:3000/api/partners', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
}).on('error', console.error);
